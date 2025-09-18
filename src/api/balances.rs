use actix_web::{get, web, HttpResponse, Responder};
use crate::db::db::Db;

#[get("/api/balances")]
pub async fn get_balances(
    db: web::Data<Db>,
    query: web::Query<std::collections::HashMap<String, String>>,
) -> impl Responder {
    let address = query.get("address").map(|x| x.as_str());
    match db.get_balances(address).await {
        Ok(balances) => HttpResponse::Ok().json(balances),
        Err(e) => {
            log::error!("Failed to get balances: {:?}", e);
            HttpResponse::InternalServerError().json("Failed to fetch balances")
        }
    }
}