use anyhow::{Context, Result};
use sqlx::{PgPool, Row};
use crate::models::{miner::MinerStats, balance::Balance, block::Block};

#[derive(Clone)]
pub struct Db {
    pub pool: PgPool,
}

impl Db {
    pub async fn new() -> Result<Self> {
        let sql_uri = std::env::var("SQL_URI").context("SQL_URI must be set in .env")?;
        let pool = sqlx::postgres::PgPoolOptions::new()
            .max_connections(20)
            .min_connections(5)
            .connect(&sql_uri)
            .await
            .context("Failed to connect to PostgreSQL database")?;
        Ok(Db { pool })
    }

    pub async fn get_miner_stats(&self, address: Option<&str>) -> Result<Vec<MinerStats>> {
        let query = match address {
            Some(addr) => sqlx::query(
                r#"
                SELECT 
                    s.address, 
                    COUNT(*) as total_shares, 
                    SUM(s.difficulty)::BIGINT as total_difficulty,
                    COALESCE((
                        SELECT COUNT(*) 
                        FROM shares s2 
                        WHERE s2.address = s.address 
                        AND s2.reward_block_hash IS NULL
                    ), 0) as invalid_shares
                FROM shares s
                WHERE s.address LIKE $1 || '%'
                GROUP BY s.address
                "#,
            )
            .bind(addr),
            None => sqlx::query(
                r#"
                SELECT 
                    s.address, 
                    COUNT(*) as total_shares, 
                    SUM(s.difficulty)::BIGINT as total_difficulty,
                    COALESCE((
                        SELECT COUNT(*) 
                        FROM shares s2 
                        WHERE s2.address = s.address 
                        AND s2.reward_block_hash IS NULL
                    ), 0) as invalid_shares
                FROM shares s
                GROUP BY s.address
                "#,
            ),
        };

        let rows = query
            .fetch_all(&self.pool)
            .await
            .context("Failed to get miner stats")?;

        let stats = rows
            .into_iter()
            .map(|row| {
                let total_shares: i64 = row.get("total_shares");
                MinerStats {
                    address: row.get("address"),
                    total_shares: total_shares as u64,
                    total_difficulty: row.get::<i64, _>("total_difficulty") as u64,
                }
            })
            .collect();
        Ok(stats)
    }

    pub async fn get_balances(&self, address: Option<&str>) -> Result<Vec<Balance>> {
        let query = match address {
            Some(addr) => sqlx::query_as::<_, Balance>(
                r#"
                SELECT address, available_balance, total_earned_balance
                FROM balances
                WHERE address LIKE $1 || '%'
                ORDER BY total_earned_balance DESC
                LIMIT 20
                "#,
            )
            .bind(addr),
            None => sqlx::query_as::<_, Balance>(
                r#"
                SELECT address, available_balance, total_earned_balance
                FROM balances
                ORDER BY total_earned_balance DESC
                LIMIT 20
                "#,
            ),
        };

        let balances = query
            .fetch_all(&self.pool)
            .await
            .context("Failed to get balances")?;
        log::info!("Fetched {} balances", balances.len());
        Ok(balances)
    }

    pub async fn get_mined_blocks(&self, address: Option<&str>) -> Result<Vec<Block>> {
        let query = match address {
            Some(addr) => sqlx::query_as::<_, Block>(
                r#"
                SELECT reward_block_hash, miner_id, daa_score, pool_wallet, amount, confirmations, processed, accepted, job_id, extranonce, nonce, timestamp
                FROM blocks
                WHERE miner_id LIKE $1 || '%'
                ORDER BY timestamp DESC
                "#,
            )
            .bind(addr),
            None => sqlx::query_as::<_, Block>(
                r#"
                SELECT reward_block_hash, miner_id, daa_score, pool_wallet, amount, confirmations, processed, accepted, job_id, extranonce, nonce, timestamp
                FROM blocks
                ORDER BY timestamp DESC
                "#,
            ),
        };

        let blocks = query
            .fetch_all(&self.pool)
            .await
            .context("Failed to get mined blocks")?;
        Ok(blocks)
    }
}