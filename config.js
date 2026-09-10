/*
 * 擁有者專用同步診斷（隱藏介面，不是登入驗證）
 * 同步事件會自動保留最近 30 筆；以下指令只控制隱藏視窗能否開啟。
 * 在瀏覽器 DevTools Console 啟用：
 * localStorage.setItem('travel_debug_enabled', '1'); location.reload();
 * 開啟紀錄：在 1.2 秒內連點「出發囉」標題三下。
 * 關閉診斷：
 * localStorage.removeItem('travel_debug_enabled'); location.reload();
 */
window.TRAVEL_CONFIG = Object.freeze({
  API_URL: 'https://script.google.com/macros/s/AKfycbw5UolaHd5fS7Bv--HBvOrACQPMp2UgM9JTHhlyUNlx5lqJink0KWOitlnPgPoR5vyd/exec',
  GOOGLE_MAPS_API_KEY: 'AIzaSyCLrHk9V-eQby0aDVx31iwFyqmhI-jIs4Q',
  APP_VERSION: '20260911.1'
});
