use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct Block {
    pub reward_block_hash: String,
    pub miner_id: String,
    pub daa_score: i64,
    pub pool_wallet: String,
    pub amount: i64,
    pub confirmations: i64,
    pub processed: i64,
    pub accepted: i64,
    pub job_id: String,
    pub extranonce: String,
    pub nonce: String,
    pub timestamp: Option<i64>,
}
