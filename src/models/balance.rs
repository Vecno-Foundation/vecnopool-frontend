use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct Balance {
    pub address: String,
    pub available_balance: i64,
    pub total_earned_balance: i64,
}
