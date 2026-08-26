use tokio_cron_scheduler::{Job, JobScheduler};

use crate::batch::index;

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
/// 現在は毎時00分に `index::execute` を実行する。
pub async fn start() {
    let scheduler = JobScheduler::new().await.unwrap();

    scheduler
        .add(
            Job::new_async("0 */5 * * * *", |_uuid, _lock| {
                Box::pin(async move {
                    index::execute().await;
                })
            })
            .unwrap(),
        )
        .await
        .unwrap();

    scheduler.start().await.unwrap();
}
