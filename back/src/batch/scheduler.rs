use tokio_cron_scheduler::{Job, JobScheduler};

use crate::batch::content_index;
use crate::batch::health_check;
use crate::batch::node_sync;
use crate::config::app::AppConfig;
use crate::service::backup;
use crate::service::content_image;

/// バッチスケジューラーを起動する。
///
/// # Cron format
///
/// `秒 分 時 日 月 曜日`
///
/// # Examples
///
/// - `0 0 * * * *`      : 毎時00分に実行
/// - `0 30 * * * *`     : 毎時30分に実行
/// - `0 0 3 * * *`      : 毎日03:00に実行
/// - `0 */5 * * * *`    : 5分間隔で実行
/// - `0 */10 * * * *`   : 10分間隔で実行
/// - `0 */30 * * * *`   : 30分間隔で実行
/// - `*/10 * * * * *`   : 10秒間隔で実行
/// - `0 0 */2 * * *`    : 2時間間隔で実行
///
/// 5 分ごとにヘルスチェック、10 分ごとにノード同期（ふだんは node_watch が変わった所をすぐに反映する）、毎分 30 秒にファイルの中身の取り込み、
/// 毎分 45 秒に定期のバックアップとゴミ箱の整理、毎時 15 分に使われなくなった Note・Wiki の画像の削除を実行する。
///
pub async fn start(config: AppConfig) {
    let folder_root = config.folder_root.clone();
    let scheduler = JobScheduler::new().await.unwrap();

    // 既存Indexバッチ
    scheduler
        .add(
            Job::new_async("0 */5 * * * *", |_uuid, _lock| {
                Box::pin(async move {
                    health_check::execute().await;
                })
            })
            .unwrap(),
        )
        .await
        .unwrap();

    // Node同期バッチ
    let sync_root = folder_root.clone();
    scheduler
        .add(
            Job::new_async("0 */10 * * * *", move |_uuid, _lock| {
                let folder_root = sync_root.clone();
                Box::pin(async move {
                    // 復元中は folder/ と DB を入れ替えているため動かさない
                    if backup::is_busy() {
                        return;
                    }
                    let result =
                        tokio::task::spawn_blocking(move || node_sync::execute(&folder_root)).await;
                    if let Ok(Err(e)) = result {
                        eprintln!("Node sync failed: {e}");
                    }
                })
            })
            .unwrap(),
        )
        .await
        .unwrap();

    // ファイルの中身の取り込みバッチ（BAT0302）。ノード同期の 30 秒後に動かし、同期で登録したファイルを取り込む
    scheduler
        .add(
            Job::new_async("30 */1 * * * *", move |_uuid, _lock| {
                let folder_root = folder_root.clone();
                Box::pin(async move {
                    let _ =
                        tokio::task::spawn_blocking(move || content_index::execute(&folder_root))
                            .await;
                })
            })
            .unwrap(),
        )
        .await
        .unwrap();

    // 定期のバックアップと、保存期間を過ぎたバックアップ・ゴミ箱のものの削除（FN0901-BR04・FN0302-BR05）。毎分 45 秒
    scheduler
        .add(
            Job::new_async("45 */1 * * * *", move |_uuid, _lock| {
                let config = config.clone();
                Box::pin(async move {
                    let _ =
                        tokio::task::spawn_blocking(move || backup::run_scheduled(&config)).await;
                })
            })
            .unwrap(),
        )
        .await
        .unwrap();

    // Note・Wiki の本文から使われなくなった画像の削除（FN0404-BR05）。毎時 15 分
    scheduler
        .add(
            Job::new_async("0 15 * * * *", |_uuid, _lock| {
                Box::pin(async move {
                    if backup::is_busy() {
                        return;
                    }
                    let _ = tokio::task::spawn_blocking(|| {
                        content_image::purge_unused(&crate::database::connection::connect())
                    })
                    .await;
                })
            })
            .unwrap(),
        )
        .await
        .unwrap();

    scheduler.start().await.unwrap();
}
