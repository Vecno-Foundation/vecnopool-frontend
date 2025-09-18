use actix_web::{get, web, HttpResponse, Responder};
use crate::db::db::Db;

#[get("/api/blocks")]
pub async fn get_mined_blocks(
    db: web::Data<Db>,
    query: web::Query<std::collections::HashMap<String, String>>,
) -> impl Responder {
    let address = query.get("address").map(|x| x.as_str());
    match db.get_mined_blocks(address).await {
        Ok(blocks) => HttpResponse::Ok().json(blocks),
        Err(e) => {
            log::error!("Failed to get mined blocks: {:?}", e);
            HttpResponse::InternalServerError().json("Failed to fetch mined blocks")
        }
    }
}