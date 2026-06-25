// version: 20260624.02
// 旅遊地點搜尋關鍵字對應表
// 用途：在呼叫後端翻譯前，先把常見旅遊關鍵字換成更適合地圖搜尋的當地語言。
(function () {
  const KEYWORD_MAP = {
    ko: {
      '烤肉': '고기집',
      '韓式烤肉': '고기집',
      '韩国烤肉': '고기집',
      '燒肉': '고기집',
      '烧肉': '고기집',
      '五花肉': '삼겹살',
      '烤五花肉': '삼겹살',
      '豬五花': '삼겹살',
      '黑豬肉': '흑돼지',
      '黑猪肉': '흑돼지',
      '海鮮': '해산물',
      '海鲜': '해산물',
      '咖啡廳': '카페',
      '咖啡厅': '카페',
      '咖啡店': '카페',
      '甜點': '디저트 카페',
      '甜点': '디저트 카페',
      '早餐': '아침식사',
      '宵夜': '야식',
      '美食': '맛집',
      '餐廳': '맛집',
      '餐厅': '맛집',
      '藥妝店': '올리브영',
      '药妆店': '올리브영',
      '藥局': '약국',
      '药局': '약국',
      '便利商店': '편의점',
      '便利店': '편의점',
      '超商': '편의점',
      '汗蒸幕': '찜질방',
      '汗蒸': '찜질방',
      '三溫暖': '사우나',
      '桑拿': '사우나',
      '換錢所': '환전소',
      '换钱所': '환전소',
      '換匯': '환전소',
      '换汇': '환전소',
      '百貨公司': '백화점',
      '百货公司': '백화점',
      '超市': '마트',
      '市場': '시장',
      '市场': '시장',
      '夜市': '야시장',
      '景點': '관광지',
      '景点': '관광지',
      '拍照': '포토존',
      '伴手禮': '기념품',
      '伴手礼': '기념품'
    },
    ja: {
      '拉麵': 'ラーメン',
      '拉面': 'ラーメン',
      '壽司': '寿司',
      '寿司': '寿司',
      '燒肉': '焼肉',
      '烧肉': '焼肉',
      '烤肉': '焼肉',
      '咖啡廳': 'カフェ',
      '咖啡厅': 'カフェ',
      '咖啡店': 'カフェ',
      '藥妝店': 'ドラッグストア',
      '药妆店': 'ドラッグストア',
      '便利商店': 'コンビニ',
      '便利店': 'コンビニ',
      '超商': 'コンビニ',
      '百貨公司': 'デパート',
      '百货公司': 'デパート',
      '景點': '観光スポット',
      '景点': '観光スポット',
      '伴手禮': 'お土産',
      '伴手礼': 'お土産'
    },
    th: {
      '咖啡廳': 'คาเฟ่',
      '咖啡厅': 'คาเฟ่',
      '咖啡店': 'คาเฟ่',
      '夜市': 'ตลาดกลางคืน',
      '按摩': 'นวด',
      '便利商店': 'ร้านสะดวกซื้อ',
      '便利店': 'ร้านสะดวกซื้อ',
      '景點': 'สถานที่ท่องเที่ยว',
      '景点': 'สถานที่ท่องเที่ยว'
    }
  };

  const CITY_MAP = {
    ko: {
      '首爾': '서울', '首尔': '서울', '서울': '서울',
      '濟州島': '제주도', '濟州': '제주', '济州岛': '제주도', '济州': '제주',
      '釜山': '부산', '仁川': '인천', '大邱': '대구',
      '弘大': '홍대', '明洞': '명동', '江南': '강남', '東大門': '동대문', '东大门': '동대문'
    },
    ja: {
      '日本': '日本', '東京': '東京', '东京': '東京', '大阪': '大阪', '京都': '京都',
      '奈良': '奈良', '札幌': '札幌', '沖繩': '沖縄', '冲绳': '沖縄',
      '福岡': '福岡', '福冈': '福岡', '名古屋': '名古屋'
    },
    th: {
      '泰國': 'ประเทศไทย', '泰国': 'ประเทศไทย', '曼谷': 'กรุงเทพฯ',
      '清邁': 'เชียงใหม่', '清迈': 'เชียงใหม่', '普吉': 'ภูเก็ต'
    }
  };

  const originalFetch = window.fetch.bind(window);

  function normalizeText(value) {
    return String(value || '').trim().replace(/\s+/g, '');
  }

  function findMappedKeyword(text, target) {
    const source = normalizeText(text);
    const map = KEYWORD_MAP[target] || {};

    // 較長的關鍵字優先，例如「韓式烤肉」要優先於「烤肉」。
    return Object.keys(map)
      .sort((a, b) => b.length - a.length)
      .find(key => source.includes(normalizeText(key)));
  }

  function findMappedCity(text, target) {
    const source = normalizeText(text);
    const map = CITY_MAP[target] || {};

    const key = Object.keys(map)
      .sort((a, b) => b.length - a.length)
      .find(city => source.includes(normalizeText(city)));

    return key ? map[key] : '';
  }

  function buildMappedTranslation(text, target) {
    const keywordKey = findMappedKeyword(text, target);
    if (!keywordKey) return null;

    const keyword = KEYWORD_MAP[target][keywordKey];
    const city = findMappedCity(text, target);
    const translatedText = city && !keyword.includes(city)
      ? `${keyword} ${city}`
      : keyword;

    return {
      status: 'ok',
      originalText: text,
      target,
      translatedText,
      detectedSourceLanguage: 'keyword-map',
      keywordMap: {
        matched: keywordKey,
        keyword,
        city
      }
    };
  }

  window.TRAVEL_KEYWORD_MAPS = Object.freeze({ KEYWORD_MAP, CITY_MAP });

  window.fetch = function patchedFetch(input, init) {
    try {
      const urlText = typeof input === 'string' ? input : (input && input.url) || '';
      if (urlText && urlText.includes('action=translate_place_keyword')) {
        const url = new URL(urlText, window.location.href);
        const text = url.searchParams.get('text') || '';
        const target = (url.searchParams.get('target') || '').toLowerCase();
        const mapped = buildMappedTranslation(text, target);

        if (mapped) {
          return Promise.resolve(new Response(JSON.stringify(mapped), {
            status: 200,
            headers: { 'Content-Type': 'application/json;charset=utf-8' }
          }));
        }
      }
    } catch (err) {
      console.warn('keyword-map fallback:', err);
    }

    return originalFetch(input, init);
  };
})();
