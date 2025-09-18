// src/api/miners.rs

use actix_web::{get, web, HttpResponse, Responder};
use serde::Serialize;
use sqlx::FromRow;
use crate::db::db::Db;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Serialize, FromRow)]
pub struct Share {
    pub address: String,
    pub difficulty: i64,
    pub timestamp: i64,
}

#[get("/api/miners")]
pub async fn get_miner_stats(
    db: web::Data<Db>,
    query: web::Query<std::collections::HashMap<String, String>>,
) -> impl Responder {
    let address = query.get("address").map(|x| x.as_str());
    match db.get_miner_stats(address).await {
        Ok(stats) => HttpResponse::Ok().json(stats),
        Err(e) => {
            log::error!("Failed to get miner stats: {:?}", e);
            HttpResponse::InternalServerError().json("Failed to fetch miner stats")
        }
    }
}

#[get("/api/shares")]
pub async fn get_shares(
    db: web::Data<Db>,
    query: web::Query<std::collections::HashMap<String, String>>,
) -> impl Responder {
    let address = query.get("address").map(|x| x.as_str());
    let cutoff_time = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("Time went backwards")
        .as_secs() as i64 - 24 * 3600; // Last 24 hours

    let query = if let Some(addr) = address {
        sqlx::query_as::<_, Share>(
            r#"
            SELECT address, difficulty, timestamp
            FROM shares
            WHERE timestamp >= $1 AND address LIKE $2 || '%'
            "#,
        )
        .bind(cutoff_time)
        .bind(addr)
    } else {
        sqlx::query_as::<_, Share>(
            r#"
            SELECT address, difficulty, timestamp
            FROM shares
            WHERE timestamp >= $1
            "#,
        )
        .bind(cutoff_time)
    };

    match query.fetch_all(&db.pool).await {
        Ok(shares) => HttpResponse::Ok().json(shares),
        Err(e) => {
            log::error!("Failed to get shares: {:?}", e);
            HttpResponse::InternalServerError().json("Failed to fetch shares")
        }
    }
}