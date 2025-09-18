use actix_web::{web, App, HttpServer, HttpRequest, Responder, HttpResponse};
use actix_web_actors::ws as ws_actors;
use actix_cors::Cors;
use dotenv::dotenv;
use tokio_postgres::NoTls;
use serde::Serialize;
use std::time::{SystemTime, UNIX_EPOCH};
use crate::db::db::Db;
use crate::ws::{start_notification_listener, WsServer};
use crate::api::miners::{get_miner_stats, get_shares};
use actix::Addr;
use actix::Actor;

mod api;
mod db;
mod models;
mod ws;

#[derive(Serialize)]
struct HashratePoint {
    timestamp: i64,
    hashrate: i64, // in hashes per second
}

async fn ws_index(r: HttpRequest, stream: web::Payload, db: web::Data<Db>, srv: web::Data<Addr<WsServer>>) -> impl Responder {
    ws_actors::start(ws::WsSession::new(db, srv.get_ref().clone()), &r, stream)
}

#[actix_web::get("/api/hashrate")]
async fn get_hashrate(db: web::Data<Db>, query: web::Query<std::collections::HashMap<String, String>>) -> impl Responder {
    let since = query
        .get("since")
        .and_then(|s| s.parse::<i64>().ok())
        .unwrap_or_else(|| {
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("Time went backwards")
                .as_secs() as i64 - 24 * 3600
        });
    let until = query
        .get("until")
        .and_then(|s| s.parse::<i64>().ok())
        .unwrap_or_else(|| {
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("Time went backwards")
                .as_secs() as i64
        });
    let address = query.get("address").map(|x| x.as_str());
    let interval_secs = 60; // 1 minute calculations

    let query = if let Some(addr) = address {
        sqlx::query_as::<_, (i64, i64)>(
            r#"
            SELECT 
                (FLOOR(timestamp / $1) * $1)::BIGINT AS time_bucket,
                SUM(difficulty)::BIGINT AS total_difficulty
            FROM shares
            WHERE timestamp >= $2 AND timestamp < $3 AND address LIKE $4 || '%'
            GROUP BY time_bucket
            ORDER BY time_bucket
            "#,
        )
        .bind(interval_secs)
        .bind(since)
        .bind(until)
        .bind(addr)
    } else {
        sqlx::query_as::<_, (i64, i64)>(
            r#"
            SELECT 
                (FLOOR(timestamp / $1) * $1)::BIGINT AS time_bucket,
                SUM(difficulty)::BIGINT AS total_difficulty
            FROM shares
            WHERE timestamp >= $2 AND timestamp < $3
            GROUP BY time_bucket
            ORDER BY time_bucket
            "#,
        )
        .bind(interval_secs)
        .bind(since)
        .bind(until)
    };

    match query.fetch_all(&db.pool).await {
        Ok(rows) => {
            let points: Vec<HashratePoint> = rows
                .into_iter()
                .map(|(timestamp, total_difficulty)| HashratePoint {
                    timestamp,
                    hashrate: total_difficulty / interval_secs, // Hashrate = difficulty / time
                })
                .collect();
            HttpResponse::Ok().json(points)
        }
        Err(e) => {
            log::error!("Failed to fetch hashrate: {:?}", e);
            HttpResponse::InternalServerError().body("Failed to fetch hashrate")
        }
    }
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    dotenv().ok();
    env_logger::init();

    let db = Db::new().await.expect("Failed to initialize database");
    let db_data = web::Data::new(db.clone());

    let (_client, connection) = tokio_postgres::connect(
        &std::env::var("SQL_URI").expect("SQL_URI must be set"),
        NoTls,
    )
    .await
    .expect("Failed to connect to PostgreSQL for notifications");

    tokio::spawn(async move {
        if let Err(e) = connection.await {
            eprintln!("PostgreSQL connection error: {}", e);
        }
    });

    let ws_server = WsServer::new().start();
    let ws_server_data = web::Data::new(ws_server);

    start_notification_listener().await;

    HttpServer::new(move || {
        let cors = Cors::default()
            .allow_any_origin()
            .allow_any_method()
            .allow_any_header();
        App::new()
            .app_data(db_data.clone())
            .app_data(ws_server_data.clone())
            .wrap(cors)
            .configure(api::init_routes)
            .service(get_miner_stats)
            .service(get_shares)
            .service(get_hashrate)
            .route("/ws", web::get().to(ws_index))
    })
    .bind("0.0.0.0:8080")?
    .run()
    .await
}