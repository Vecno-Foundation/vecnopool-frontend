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

#[derive(Serialize, Debug)]
struct HashratePoint {
    timestamp: i64,
    hashrate: i64,
}

async fn ws_index(r: HttpRequest, stream: web::Payload, db: web::Data<Db>, srv: web::Data<Addr<WsServer>>) -> impl Responder {
    ws_actors::start(ws::WsSession::new(db, srv.get_ref().clone()), &r, stream)
}

#[actix_web::get("/api/hashrate")]
async fn get_hashrate(db: web::Data<Db>, query: web::Query<std::collections::HashMap<String, String>>) -> impl Responder {
    // Load WINDOW_TIME_MS for consistency
    let window_time_ms: u64 = std::env::var("WINDOW_TIME_MS")
        .map(|val| val.parse::<u64>().map_err(|e| anyhow::anyhow!("Invalid WINDOW_TIME_MS: {}", e)))
        .unwrap_or(Ok(300_000))
        .expect("Failed to parse WINDOW_TIME_MS");
    let _window_time_secs = window_time_ms / 1000;

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
    let interval_secs = 600;

    log::debug!("Fetching hashrate: address={:?}, since={}, until={}, interval_secs={}", address, since, until, interval_secs);

    match db.get_hashrate(address, since, until, interval_secs).await {
        Ok(rows) => {
            log::info!("Fetched {} hashrate rows for address={:?}", rows.len(), address);
            let points: Vec<HashratePoint> = rows
                .into_iter()
                .map(|(timestamp, total_difficulty)| {
                    let hashrate = if total_difficulty > 0 {
                        total_difficulty / interval_secs // Hashrate = difficulty / time
                    } else {
                        0
                    };
                    HashratePoint { timestamp, hashrate }
                })
                .collect();
            log::debug!("Hashrate points: {:?}", points);
            HttpResponse::Ok().json(points)
        }
        Err(e) => {
            log::error!("Failed to fetch hashrate: {:?}", e);
            HttpResponse::InternalServerError().body("Failed to fetch hashrate")
        }
    }
}

#[actix_web::get("/api/balances")]
async fn get_balances(
    db: web::Data<Db>,
    query: web::Query<std::collections::HashMap<String, String>>,
) -> impl Responder {
    let address = query.get("address").map(|x| x.as_str());
    match db.get_balances(address).await {
        Ok(balances) => HttpResponse::Ok().json(balances),
        Err(e) => {
            log::error!("Failed to get balances: {:?}", e);
            HttpResponse::InternalServerError().body("Failed to fetch balances")
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
            .service(get_balances)
            .route("/ws", web::get().to(ws_index))
    })
    .bind("0.0.0.0:8080")?
    .run()
    .await
}