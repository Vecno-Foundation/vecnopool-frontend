// src/models/miner.rs

use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct MinerStats {
    pub address: String,
    pub total_shares: u64,
    pub total_difficulty: u64,
}