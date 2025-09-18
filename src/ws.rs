// src/ws.rs

use actix_web_actors::ws::{self, WebsocketContext};
use actix::{Actor, Addr, AsyncContext, Context, Handler, Message};
use actix_web::web;
use serde::{Deserialize, Serialize};
use sqlx::postgres::PgListener;
use std::collections::HashSet;
use crate::db::db::Db;

#[derive(Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum WsNotification {
    MinerStatsUpdated,
    BalancesUpdated,
    BlocksUpdated,
    HashrateUpdated,
}

#[derive(Clone)]
pub struct WsSession {
    #[allow(dead_code)]
    db: web::Data<Db>,
    addr: Addr<WsServer>,
}

impl WsSession {
    pub fn new(db: web::Data<Db>, addr: Addr<WsServer>) -> Self {
        WsSession { db, addr }
    }
}

impl Actor for WsSession {
    type Context = WebsocketContext<Self>;
}

impl actix::StreamHandler<Result<ws::Message, ws::ProtocolError>> for WsSession {
    fn handle(&mut self, msg: Result<ws::Message, ws::ProtocolError>, ctx: &mut Self::Context) {
        match msg {
            Ok(ws::Message::Ping(msg)) => ctx.pong(&msg),
            Ok(ws::Message::Text(_)) => {}, // Handle client messages if needed
            Ok(ws::Message::Close(_)) => ctx.close(None),
            _ => (),
        }
    }

    fn started(&mut self, ctx: &mut Self::Context) {
        self.addr.do_send(RegisterClient(ctx.address()));
    }

    fn finished(&mut self, ctx: &mut Self::Context) {
        self.addr.do_send(UnregisterClient(ctx.address()));
    }
}

#[derive(Message)]
#[rtype(result = "()")]
pub struct RegisterClient(pub Addr<WsSession>);

#[derive(Message)]
#[rtype(result = "()")]
pub struct UnregisterClient(pub Addr<WsSession>);

#[derive(Message)]
#[rtype(result = "()")]
pub struct BroadcastMessage(pub String);

#[derive(Message)]
#[rtype(result = "()")]
pub struct WsMessage(pub String);

impl actix::Handler<WsMessage> for WsSession {
    type Result = ();

    fn handle(&mut self, msg: WsMessage, ctx: &mut Self::Context) {
        ctx.text(msg.0);
    }
}

pub struct WsServer {
    clients: HashSet<Addr<WsSession>>,
}

impl WsServer {
    pub fn new() -> Self {
        WsServer {
            clients: HashSet::new(),
        }
    }
}

impl Actor for WsServer {
    type Context = Context<Self>;
}

impl Handler<RegisterClient> for WsServer {
    type Result = ();

    fn handle(&mut self, msg: RegisterClient, _: &mut Self::Context) {
        self.clients.insert(msg.0);
    }
}

impl Handler<UnregisterClient> for WsServer {
    type Result = ();

    fn handle(&mut self, msg: UnregisterClient, _: &mut Self::Context) {
        self.clients.remove(&msg.0);
    }
}

impl Handler<BroadcastMessage> for WsServer {
    type Result = ();

    fn handle(&mut self, msg: BroadcastMessage, _: &mut Self::Context) {
        for client in &self.clients {
            client.do_send(WsMessage(msg.0.clone()));
        }
    }
}

pub async fn start_notification_listener() {
    let sql_uri = std::env::var("SQL_URI").expect("SQL_URI must be set");
    let mut listener = PgListener::connect(&sql_uri)
        .await
        .expect("Failed to connect to PostgreSQL for notifications");

    listener
        .listen("shares_channel")
        .await
        .expect("Failed to LISTEN on shares_channel");
    listener
        .listen("balances_channel")
        .await
        .expect("Failed to LISTEN on balances_channel");
    listener
        .listen("blocks_channel")
        .await
        .expect("Failed to LISTEN on blocks_channel");

    let ws_server = WsServer::new().start();

    tokio::spawn(async move {
        while let Ok(notification) = listener.recv().await {
            let message = match notification.channel() {
                "shares_channel" => serde_json::to_string(&WsNotification::HashrateUpdated).unwrap(),
                "balances_channel" => serde_json::to_string(&WsNotification::BalancesUpdated).unwrap(),
                "blocks_channel" => serde_json::to_string(&WsNotification::BlocksUpdated).unwrap(),
                _ => continue,
            };
            ws_server.do_send(BroadcastMessage(message));
        }
    });
}