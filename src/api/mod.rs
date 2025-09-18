pub mod miners;
pub mod balances;
pub mod blocks;

use actix_web::web;

pub fn init_routes(cfg: &mut web::ServiceConfig) {
    cfg.service(miners::get_miner_stats);
    cfg.service(balances::get_balances);
    cfg.service(blocks::get_mined_blocks);
}