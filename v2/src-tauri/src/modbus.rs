use serde::{Deserialize, Serialize};
use std::net::SocketAddr;
use std::sync::Arc;
use tauri::State;
use tokio::sync::Mutex;
use tokio_modbus::prelude::*;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum ModbusError {
    #[error("Modbus IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Not connected")]
    NotConnected,
    #[error("Invalid address: {0}")]
    InvalidAddress(String),
}

impl Serialize for ModbusError {
    fn serialize<S: serde::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        s.serialize_str(&self.to_string())
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ModbusConnectArgs {
    pub host: String,
    pub port: u16,
    /// Modbus unit/slave ID (1–247)
    pub unit_id: u8,
}

#[derive(Debug, Serialize)]
pub struct ModbusReadResult {
    pub registers: Vec<u16>,
    pub address: u16,
    pub count: u16,
}

pub struct ModbusState {
    pub ctx: Option<tokio_modbus::client::Context>,
}

pub type SharedModbus = Arc<Mutex<ModbusState>>;

pub fn new_modbus_state() -> SharedModbus {
    Arc::new(Mutex::new(ModbusState { ctx: None }))
}

/// Connect to a Modbus TCP server.
#[tauri::command]
pub async fn modbus_connect(
    args: ModbusConnectArgs,
    state: State<'_, SharedModbus>,
) -> Result<(), ModbusError> {
    let addr: SocketAddr = format!("{}:{}", args.host, args.port)
        .parse()
        .map_err(|e| ModbusError::InvalidAddress(format!("{e}")))?;

    let slave = Slave(args.unit_id);
    let ctx = tcp::connect_slave(addr, slave).await?;

    let mut guard = state.lock().await;
    guard.ctx = Some(ctx);
    Ok(())
}

/// Disconnect from the current Modbus session.
#[tauri::command]
pub async fn modbus_disconnect(state: State<'_, SharedModbus>) -> Result<(), ModbusError> {
    let mut guard = state.lock().await;
    guard.ctx = None;
    Ok(())
}

/// Read holding registers (FC 03).
#[tauri::command]
pub async fn modbus_read_holding(
    address: u16,
    count: u16,
    state: State<'_, SharedModbus>,
) -> Result<ModbusReadResult, ModbusError> {
    let mut guard = state.lock().await;
    let ctx = guard.ctx.as_mut().ok_or(ModbusError::NotConnected)?;
    let registers = ctx.read_holding_registers(address, count).await??;
    Ok(ModbusReadResult { registers, address, count })
}

/// Read input registers (FC 04).
#[tauri::command]
pub async fn modbus_read_input(
    address: u16,
    count: u16,
    state: State<'_, SharedModbus>,
) -> Result<ModbusReadResult, ModbusError> {
    let mut guard = state.lock().await;
    let ctx = guard.ctx.as_mut().ok_or(ModbusError::NotConnected)?;
    let registers = ctx.read_input_registers(address, count).await??;
    Ok(ModbusReadResult { registers, address, count })
}

/// Write a single holding register (FC 06).
#[tauri::command]
pub async fn modbus_write_single(
    address: u16,
    value: u16,
    state: State<'_, SharedModbus>,
) -> Result<(), ModbusError> {
    let mut guard = state.lock().await;
    let ctx = guard.ctx.as_mut().ok_or(ModbusError::NotConnected)?;
    ctx.write_single_register(address, value).await??;
    Ok(())
}
