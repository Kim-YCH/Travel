(function (window) {
  'use strict';

  // 純產生器：只讀傳入的資料，不碰 Vue ref、DOM、剪貼簿或下載。
  // 觸發下載與複製的動作留在 app.js。
  //
  // ctx 需要提供：
  //   trip                旅程物件
  //   totalDays           天數
  //   appVersion          版本字串（寫在備份頁尾與檔名）
  //   isKoreaTrip         是否為韓國行程，決定地圖按鈕文字
  //   dayLabel(d)         Day 的日期標籤
  //   getDayOrderedItems(d, isAlternative)  已排序的當日行程
  //   getHotelsForDay(d)  當日住宿
  //   getMapExportLinks(place)  地圖連結

  const esc = (s) => window.TravelUtils.escapeHtml(s);
  const time = (t) => window.TravelUtils.formatTime(t);
  const info = (item) => window.TravelItinerary.getItineraryInfoText(item);

  const oneLine = (text) => String(text || '').replace(/\n/g, ' ');

  const buildItineraryText = (ctx) => {
    const { trip, totalDays, dayLabel, getDayOrderedItems, getHotelsForDay } = ctx;
    if (!trip) return '';

    let text = `【${trip.name}】行程表\n\n`;

    for (let d = 1; d <= totalDays; d++) {
      text += `📅 Day ${d}`;
      const label = dayLabel(d);
      if (label) text += ` | ${label}`;
      text += `\n`;

      const dayItems = getDayOrderedItems(d, false);
      const dayAlternatives = getDayOrderedItems(d, true);
      const dayHotels = getHotelsForDay(d);

      if (dayItems.length === 0 && dayAlternatives.length === 0 && dayHotels.length === 0) {
        text += '  (無行程)\n\n';
        continue;
      }

      const line = (item, indent) => {
        const detail = info(item);
        const msg = detail ? ` (${oneLine(detail)})` : '';
        const at = time(item.time) ? time(item.time) + ' ' : '';
        return `${indent}${at}${item.name}${msg}\n`;
      };

      dayItems.forEach((item) => { text += line(item, '  '); });

      if (dayAlternatives.length > 0) {
        text += `  📌 備案\n`;
        dayAlternatives.forEach((item) => { text += line(item, '    '); });
      }

      dayHotels.forEach((hotel) => {
        const addr = hotel.address ? ` (${hotel.address})` : '';
        text += `  🏠 ${hotel.name || '住宿'}${addr}\n`;
      });

      text += '\n';
    }

    return text;
  };

  const buildBackupPlaceCardHtml = (ctx, place, icon = '📍') => {
    const links = ctx.getMapExportLinks(place || {});
    const name = esc(place?.name || place?.title || '地點');
    const at = time(place?.time || '');
    const detail = info(place);
    const msg = detail ? esc(oneLine(detail)) : '';
    const addr = place?.address ? esc(place.address) : '';
    const appText = ctx.isKoreaTrip ? '開啟 Naver Map' : '開啟地圖 App';
    const appBtn = links.app
      ? `<a class="map-btn" href="${esc(links.app)}">${appText}</a>`
      : '';

    return `
        <div class="place-card">
          <div class="place-head">
            <div class="place-icon">${icon}</div>
            <div class="place-main">
              <div class="place-title">${at ? `<span class="place-time">${esc(at)}</span>` : ''}${name}</div>
              ${addr ? `<div class="place-address">${addr}</div>` : ''}
              ${msg ? `<div class="place-note">${msg}</div>` : ''}
            </div>
          </div>
          ${appBtn}
        </div>`;
  };

  const BACKUP_STYLE = `
    body{margin:0;background:#f8fafc;color:#111827;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;line-height:1.45;}
    .wrap{max-width:520px;margin:0 auto;padding:22px 16px 40px;}
    .hero{background:#2563eb;color:white;border-radius:22px;padding:18px 16px;box-shadow:0 10px 28px rgba(37,99,235,.22);margin-bottom:16px;}
    h1{margin:0;font-size:24px;font-weight:900;}
    .hint{font-size:12px;color:#dbeafe;margin-top:6px;}
    .day-section{margin:14px 0 18px;}
    h2{font-size:16px;margin:0 0 10px;color:#334155;}
    .sub-title{font-weight:900;color:#92400e;background:#fef3c7;border:1px solid #fde68a;border-radius:999px;display:inline-block;padding:4px 10px;margin:6px 0 8px;font-size:12px;}
    .place-card{background:#fff;border:1px solid #e5e7eb;border-radius:18px;padding:13px;margin-bottom:10px;box-shadow:0 3px 10px rgba(15,23,42,.05);}
    .place-head{display:flex;gap:10px;align-items:flex-start;}
    .place-icon{width:32px;height:32px;border-radius:12px;background:#eff6ff;display:flex;align-items:center;justify-content:center;flex-shrink:0;}
    .place-main{min-width:0;flex:1;}
    .place-title{font-size:16px;font-weight:900;color:#111827;word-break:break-word;}
    .place-time{color:#2563eb;margin-right:7px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;}
    .place-address{font-size:12px;color:#64748b;margin-top:3px;word-break:break-word;}
    .place-note{font-size:13px;color:#475569;background:#f8fafc;border-radius:12px;padding:8px 10px;margin-top:8px;word-break:break-word;}
    .map-btn{display:block;text-align:center;text-decoration:none;background:#0d9488;color:#fff;font-weight:900;border-radius:14px;padding:11px 12px;margin-top:11px;}
    .footer{font-size:11px;color:#94a3b8;text-align:center;margin-top:24px;}
  `;

  const buildBackupHtml = (ctx) => {
    const { trip, totalDays, appVersion, dayLabel, getDayOrderedItems, getHotelsForDay } = ctx;
    if (!trip) return '';

    const tripName = esc(trip.name || '行程備份');
    let body = '';

    for (let d = 1; d <= totalDays; d++) {
      const dayItems = getDayOrderedItems(d, false);
      const dayAlternatives = getDayOrderedItems(d, true);
      const dayHotels = getHotelsForDay(d);
      if (dayItems.length === 0 && dayAlternatives.length === 0 && dayHotels.length === 0) continue;

      const label = dayLabel(d);
      body += `<section class="day-section"><h2>📅 Day ${d}${label ? `｜${esc(label)}` : ''}</h2>`;
      dayItems.forEach((item) => { body += buildBackupPlaceCardHtml(ctx, item, '📍'); });
      if (dayAlternatives.length) {
        body += `<div class="sub-title">📌 備案</div>`;
        dayAlternatives.forEach((item) => { body += buildBackupPlaceCardHtml(ctx, item, '📌'); });
      }
      dayHotels.forEach((hotel) => { body += buildBackupPlaceCardHtml(ctx, hotel, '🏠'); });
      body += `</section>`;
    }

    return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>${tripName} 備份行程</title>
  <style>${BACKUP_STYLE}</style>
</head>
<body>
  <div class="wrap">
    <div class="hero"><h1>${tripName}</h1><div class="hint">備份行程｜按地點下方按鈕可嘗試開啟地圖 App</div></div>
    ${body || '<div class="place-card">目前沒有行程資料</div>'}
    <div class="footer">backup ${esc(appVersion)}</div>
  </div>
</body>
</html>`;
  };

  const backupFileName = (tripName, appVersion) => {
    const safeName = String(tripName || 'trip').replace(/[\\/:*?"<>|]+/g, '_');
    return `${safeName}_備份行程_${appVersion}.html`;
  };

  window.TravelExport = Object.freeze({
    buildItineraryText,
    buildBackupPlaceCardHtml,
    buildBackupHtml,
    backupFileName
  });
})(window);
