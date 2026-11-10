const FORMATTER = new Intl.DateTimeFormat('zh-TW', {
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

/** 把 ISO 時間轉成本地時區的「月/日 時:分:秒」。 */
export function formatTime(iso: string | null, fallback = '尚無資料'): string {
  return iso ? FORMATTER.format(new Date(iso)) : fallback;
}
