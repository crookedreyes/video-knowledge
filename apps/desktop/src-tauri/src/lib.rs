use std::sync::{Arc, Mutex};
use std::process::Child;
use tauri::{State, AppHandle};

#[derive(Default)]
pub struct SidecarState {
    process: Arc<Mutex<Option<Child>>>,
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! Welcome to Tauri.", name)
}

async fn spawn_sidecar(handle: &AppHandle) -> Result<std::process::Child, String> {
    let sidecar_cmd = if cfg!(debug_assertions) {
        // In dev mode, use `bun run` directly
        "bun"
    } else {
        // In production, use compiled binary with target triple
        let target = std::env::var("TARGET").unwrap_or_else(|_| "x86_64-unknown-linux-gnu".to_string());
        &format!("bun-backend-{}", target)
    };

    let args = if cfg!(debug_assertions) {
        vec!["run", "--cwd", "../backend", "src/index.ts"]
    } else {
        vec![]
    };

    log::info!("Spawning sidecar: {} {:?}", sidecar_cmd, args);

    let process = if cfg!(debug_assertions) {
        std::process::Command::new(sidecar_cmd)
            .args(&args)
            .spawn()
            .map_err(|e| format!("Failed to spawn sidecar: {}", e))?
    } else {
        let sidecar_path = handle
            .path()
            .resource_dir()
            .map_err(|e| format!("Failed to get resource dir: {}", e))?
            .join(sidecar_cmd);

        std::process::Command::new(sidecar_path)
            .spawn()
            .map_err(|e| format!("Failed to spawn sidecar: {}", e))?
    };

    log::info!("Sidecar spawned with PID: {:?}", process.id());
    Ok(process)
}

async fn health_check(url: &str, max_retries: u32, retry_delay_ms: u64) -> Result<(), String> {
    let client = reqwest::Client::new();
    let mut retries = 0;

    loop {
        match client.get(url).send().await {
            Ok(response) if response.status() == 200 => {
                log::info!("Health check passed for {}", url);
                return Ok(());
            }
            Ok(response) => {
                log::warn!("Health check returned status {}", response.status());
            }
            Err(e) => {
                log::debug!("Health check failed: {}", e);
            }
        }

        retries += 1;
        if retries >= max_retries {
            return Err(format!("Health check failed after {} retries", max_retries));
        }

        tokio::time::sleep(tokio::time::Duration::from_millis(retry_delay_ms)).await;
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_process::init())
        .manage(SidecarState::default())
        .invoke_handler(tauri::generate_handler![greet])
        .setup(|app| {
            let app_handle = app.handle().clone();
            let sidecar_state: State<SidecarState> = app.state();
            let process_ref = sidecar_state.process.clone();

            // Spawn sidecar in background
            tauri::async_runtime::spawn(async move {
                match spawn_sidecar(&app_handle).await {
                    Ok(process) => {
                        *process_ref.lock().unwrap() = Some(process);

                        // Wait for health check
                        match health_check(
                            "http://localhost:3456/api/health",
                            30,
                            500,
                        )
                        .await
                        {
                            Ok(_) => {
                                log::info!("Sidecar health check succeeded");
                            }
                            Err(e) => {
                                log::error!("Sidecar health check failed: {}", e);
                            }
                        }
                    }
                    Err(e) => {
                        log::error!("Failed to spawn sidecar: {}", e);
                    }
                }
            });

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let window_clone = window.clone();
                tauri::async_runtime::spawn(async move {
                    window_clone.close().ok();
                });
            }
        })
        .on_exit(|app| {
            let sidecar_state: State<SidecarState> = app.state();
            if let Ok(mut process_guard) = sidecar_state.process.lock() {
                if let Some(mut process) = process_guard.take() {
                    log::info!("Killing sidecar process");
                    match process.kill() {
                        Ok(_) => log::info!("Sidecar process killed"),
                        Err(e) => log::error!("Failed to kill sidecar: {}", e),
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .unwrap_or_else(|e| panic!("Failed to start Tauri application: {}", e));
}
