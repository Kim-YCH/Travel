// version: 20260718.5
// 旅遊地點搜尋關鍵字對應表（日韓版）
// 用途：在呼叫後端翻譯前，先把常見旅遊關鍵字換成更適合 Google Maps 地點搜尋的當地語言。
(function () {
  const KEYWORD_MAP = {
    ko: [
      // ===== 韓國：飲食 =====
      { value: '고기집', aliases: ['烤肉', '韓式烤肉', '韩国烤肉', '燒肉', '烧肉', '炭火烤肉', '韓牛烤肉', '韩牛烤肉'] },
      { value: '삼겹살', aliases: ['五花肉', '烤五花肉', '豬五花', '猪五花', '三層肉', '三层肉'] },
      { value: '흑돼지', aliases: ['黑豬肉', '黑猪肉', '濟州黑豬', '济州黑猪', '濟州黑豬肉', '济州黑猪肉'] },
      { value: '갈비', aliases: ['排骨', '韓式排骨', '烤排骨', '牛排骨', '豬排骨'] },
      { value: '치킨', aliases: ['炸雞', '炸鸡', '韓式炸雞', '韩式炸鸡'] },
      { value: '부대찌개', aliases: ['部隊鍋', '部队锅'] },
      { value: '삼계탕', aliases: ['蔘雞湯', '参鸡汤', '人蔘雞湯', '人参鸡汤'] },
      { value: '냉면', aliases: ['冷麵', '冷面'] },
      { value: '비빔밥', aliases: ['拌飯', '拌饭', '石鍋拌飯', '石锅拌饭'] },
      { value: '김치찌개', aliases: ['泡菜鍋', '泡菜锅', '泡菜湯', '泡菜汤'] },
      { value: '순두부찌개', aliases: ['嫩豆腐鍋', '嫩豆腐锅', '豆腐鍋', '豆腐锅'] },
      { value: '감자탕', aliases: ['馬鈴薯排骨湯', '马铃薯排骨汤', '豬骨湯', '猪骨汤', '脊骨湯', '脊骨汤'] },
      { value: '국밥', aliases: ['湯飯', '汤饭', '豬肉湯飯', '猪肉汤饭'] },
      { value: '설렁탕', aliases: ['雪濃湯', '雪浓汤'] },
      { value: '곰탕', aliases: ['牛骨湯', '牛骨汤', '牛肉湯', '牛肉汤'] },
      { value: '족발', aliases: ['豬腳', '猪脚', '韓式豬腳', '韩式猪脚'] },
      { value: '보쌈', aliases: ['包肉', '菜包肉'] },
      { value: '떡볶이', aliases: ['辣炒年糕', '炒年糕', '年糕', '烤年糕'] },
      { value: '어묵', aliases: ['魚板', '鱼板', '魚糕', '鱼糕'] },
      { value: '순대', aliases: ['血腸', '血肠', '米腸', '米肠'] },
      { value: '김밥', aliases: ['飯捲', '饭卷', '紫菜包飯', '紫菜包饭', '海苔飯捲', '海苔饭卷'] },
      { value: '해산물', aliases: ['海鮮', '海鲜'] },
      { value: '회', aliases: ['生魚片', '生鱼片', '刺身'] },
      { value: '생선구이', aliases: ['烤魚', '烤鱼'] },
      { value: '전복죽', aliases: ['鮑魚粥', '鲍鱼粥'] },
      { value: '카페', aliases: ['咖啡廳', '咖啡厅', '咖啡店', '咖啡館', '咖啡馆', '咖啡'] },
      { value: '디저트 카페', aliases: ['甜點', '甜点', '蛋糕', '下午茶', '鬆餅', '松饼'] },
      { value: '브런치', aliases: ['早午餐', 'brunch'] },
      { value: '아침식사', aliases: ['早餐'] },
      { value: '야식', aliases: ['宵夜', '消夜'] },
      { value: '맛집', aliases: ['美食', '餐廳', '餐厅', '吃飯', '吃饭', '晚餐', '午餐', '推薦餐廳', '推荐餐厅'] },
      { value: '시장 맛집', aliases: ['市場美食', '市场美食', '傳統市場美食', '传统市场美食'] },
      { value: '포장마차', aliases: ['路邊攤', '路边摊', '小吃攤', '小吃摊', '布帳馬車', '布帐马车'] },

      // ===== 韓國：購物 =====
      { value: '올리브영', aliases: ['藥妝店', '药妆店', '藥妝', '药妆', 'olive young', 'OLIVE YOUNG'] },
      { value: '화장품', aliases: ['化妝品', '化妆品', '美妝', '美妆', '保養品', '保养品'] },
      { value: '편의점', aliases: ['便利商店', '便利店', '超商'] },
      { value: '마트', aliases: ['超市', '大賣場', '大卖场', '賣場', '卖场'] },
      { value: '롯데마트', aliases: ['樂天超市', '乐天超市', 'lotte mart'] },
      { value: '백화점', aliases: ['百貨公司', '百货公司', '百貨', '百货'] },
      { value: '쇼핑몰', aliases: ['商場', '商场', '購物中心', '购物中心', 'mall'] },
      { value: '쇼핑', aliases: ['購物', '购物', '逛街'] },
      { value: '지하상가', aliases: ['地下街', '地下商街'] },
      { value: '아울렛', aliases: ['outlet', 'Outlet', '暢貨中心', '畅货中心'] },
      { value: '시장', aliases: ['市場', '市场', '傳統市場', '传统市场'] },
      { value: '야시장', aliases: ['夜市'] },
      { value: '기념품', aliases: ['伴手禮', '伴手礼', '紀念品', '纪念品', '手信'] },
      { value: '소품샵', aliases: ['文創小店', '文创小店', '雜貨店', '杂货店', '小物店'] },
      { value: '서점', aliases: ['書店', '书店'] },

      // ===== 韓國：服務 / 旅行常用 =====
      { value: '환전소', aliases: ['換錢所', '换钱所', '換匯', '换汇', '兌換所', '兑换所'] },
      { value: 'ATM', aliases: ['提款機', '提款机', 'ATM'] },
      { value: '약국', aliases: ['藥局', '药局', '藥房', '药房'] },
      { value: '병원', aliases: ['醫院', '医院'] },
      { value: '찜질방', aliases: ['汗蒸幕', '汗蒸房', '汗蒸', '찜질방'] },
      { value: '사우나', aliases: ['三溫暖', '三温暖', '桑拿', 'sauna'] },
      { value: '마사지', aliases: ['按摩', 'spa', 'SPA'] },
      { value: '피부관리', aliases: ['美容', '做臉', '做脸', '皮膚管理', '皮肤管理'] },
      { value: '네일', aliases: ['美甲', '指甲'] },
      { value: '빨래방', aliases: ['洗衣店', '自助洗衣', '投幣洗衣', '投币洗衣'] },
      { value: '물품보관함', aliases: ['寄物櫃', '寄物柜', '置物櫃', '置物柜', '行李櫃', '行李柜'] },
      { value: '짐 보관', aliases: ['行李寄放', '寄放行李', '行李保管'] },
      { value: '화장실', aliases: ['廁所', '厕所', '洗手間', '洗手间'] },

      // ===== 韓國：交通 =====
      { value: '지하철역', aliases: ['地鐵站', '地铁站', '捷運站', '捷运站'] },
      { value: '역', aliases: ['車站', '车站', '火車站', '火车站'] },
      { value: '버스정류장', aliases: ['公車站', '公交站', '巴士站'] },
      { value: '공항버스', aliases: ['機場巴士', '机场巴士'] },
      { value: '택시', aliases: ['計程車', '计程车', '的士', '出租車', '出租车'] },
      { value: '렌터카', aliases: ['租車', '租车'] },
      { value: '주차장', aliases: ['停車場', '停车场'] },
      { value: '주유소', aliases: ['加油站'] },

      // ===== 韓國：景點 =====
      { value: '관광지', aliases: ['景點', '景点', '觀光景點', '观光景点', '旅遊景點', '旅游景点'] },
      { value: '전망대', aliases: ['觀景台', '观景台', '展望台', '瞭望台'] },
      { value: '공원', aliases: ['公園', '公园'] },
      { value: '해변', aliases: ['海邊', '海边'] },
      { value: '해수욕장', aliases: ['海灘', '海滩', '沙灘', '沙滩'] },
      { value: '폭포', aliases: ['瀑布'] },
      { value: '박물관', aliases: ['博物館', '博物馆'] },
      { value: '미술관', aliases: ['美術館', '美术馆'] },
      { value: '궁궐', aliases: ['宮殿', '宫殿', '古宮', '古宫'] },
      { value: '사찰', aliases: ['寺廟', '寺庙', '寺院'] },
      { value: '성당', aliases: ['教堂', '聖堂', '圣堂'] },
      { value: '야경', aliases: ['夜景'] },
      { value: '포토존', aliases: ['拍照', '打卡', '網美景點', '网美景点', '拍照景點', '拍照景点'] },
      { value: '벚꽃 명소', aliases: ['櫻花', '樱花', '賞櫻', '赏樱'] },
      { value: '단풍 명소', aliases: ['楓葉', '枫叶', '賞楓', '赏枫', '紅葉', '红叶'] },
      { value: '수족관', aliases: ['水族館', '水族馆'] },
      { value: '동물원', aliases: ['動物園', '动物园'] },
      { value: '테마파크', aliases: ['樂園', '乐园', '遊樂園', '游乐园', '主題樂園', '主题乐园'] }
    ],

    ja: [
      // ===== 日本：飲食 =====
      { value: 'ラーメン', aliases: ['拉麵', '拉面', '拉麵店', '拉面店'] },
      { value: 'つけ麺', aliases: ['沾麵', '沾面'] },
      { value: '寿司', aliases: ['壽司', '寿司'] },
      { value: '回転寿司', aliases: ['迴轉壽司', '回转寿司', '旋轉壽司', '旋转寿司'] },
      { value: '焼肉', aliases: ['燒肉', '烧肉', '烤肉', '日式燒肉', '日式烧肉'] },
      { value: '和牛', aliases: ['和牛'] },
      { value: '串カツ', aliases: ['串炸', '炸串'] },
      { value: 'お好み焼き', aliases: ['大阪燒', '大阪烧', '御好燒', '御好烧'] },
      { value: 'たこ焼き', aliases: ['章魚燒', '章鱼烧', '章魚小丸子', '章鱼小丸子'] },
      { value: '天ぷら', aliases: ['天婦羅', '天妇罗'] },
      { value: 'うなぎ', aliases: ['鰻魚飯', '鳗鱼饭', '鰻魚', '鳗鱼'] },
      { value: 'カレー', aliases: ['咖哩飯', '咖喱饭', '咖哩', '咖喱'] },
      { value: 'とんかつ', aliases: ['豬排', '猪排', '炸豬排', '炸猪排'] },
      { value: 'そば', aliases: ['蕎麥麵', '荞麦面', '蕎麥', '荞麦'] },
      { value: 'うどん', aliases: ['烏龍麵', '乌龙面', '烏冬', '乌冬'] },
      { value: '居酒屋', aliases: ['居酒屋', '喝酒', '小酌'] },
      { value: '焼き鳥', aliases: ['烤雞串', '烤鸡串', '串燒', '串烧'] },
      { value: 'カフェ', aliases: ['咖啡廳', '咖啡厅', '咖啡店', '咖啡館', '咖啡馆', '咖啡'] },
      { value: 'スイーツ カフェ', aliases: ['甜點', '甜点', '蛋糕', '下午茶'] },
      { value: '抹茶 カフェ', aliases: ['抹茶', '抹茶甜點', '抹茶甜点'] },
      { value: 'パン屋', aliases: ['麵包店', '面包店', '烘焙店'] },
      { value: '朝食', aliases: ['早餐'] },
      { value: 'ブランチ', aliases: ['早午餐', 'brunch'] },
      { value: '深夜営業 レストラン', aliases: ['宵夜', '消夜', '深夜食堂'] },
      { value: 'グルメ', aliases: ['美食', '餐廳', '餐厅', '吃飯', '吃饭', '午餐', '晚餐', '推薦餐廳', '推荐餐厅'] },
      { value: '市場 グルメ', aliases: ['市場美食', '市场美食'] },

      // ===== 日本：購物 =====
      { value: 'ドラッグストア', aliases: ['藥妝店', '药妆店', '藥妝', '药妆'] },
      { value: 'ドン・キホーテ', aliases: ['唐吉訶德', '唐吉诃德', '驚安殿堂', '惊安殿堂', 'donki', 'Donki'] },
      { value: 'コンビニ', aliases: ['便利商店', '便利店', '超商'] },
      { value: 'スーパー', aliases: ['超市', '超級市場', '超级市场'] },
      { value: 'デパート', aliases: ['百貨公司', '百货公司', '百貨', '百货'] },
      { value: 'ショッピングモール', aliases: ['商場', '商场', '購物中心', '购物中心', 'mall'] },
      { value: 'ショッピング', aliases: ['購物', '购物', '逛街'] },
      { value: '家電量販店', aliases: ['電器行', '电器行', '家電', '家电'] },
      { value: 'アニメショップ', aliases: ['動漫店', '动漫店', '動漫', '动漫', '二次元'] },
      { value: 'ガチャガチャ', aliases: ['扭蛋', '轉蛋', '转蛋'] },
      { value: 'アウトレット', aliases: ['outlet', 'Outlet', '暢貨中心', '畅货中心'] },
      { value: '市場', aliases: ['市場', '市场', '傳統市場', '传统市场'] },
      { value: 'お土産', aliases: ['伴手禮', '伴手礼', '紀念品', '纪念品', '手信'] },
      { value: '雑貨屋', aliases: ['雜貨店', '杂货店', '文創小店', '文创小店', '小物店'] },
      { value: '書店', aliases: ['書店', '书店'] },

      // ===== 日本：服務 / 旅行常用 =====
      { value: '両替所', aliases: ['換錢所', '换钱所', '換匯', '换汇', '兌換所', '兑换所'] },
      { value: 'ATM', aliases: ['提款機', '提款机', 'ATM'] },
      { value: '薬局', aliases: ['藥局', '药局', '藥房', '药房'] },
      { value: '病院', aliases: ['醫院', '医院'] },
      { value: '温泉', aliases: ['溫泉', '温泉'] },
      { value: '銭湯', aliases: ['錢湯', '钱汤', '澡堂'] },
      { value: 'マッサージ', aliases: ['按摩', 'spa', 'SPA'] },
      { value: 'ネイル', aliases: ['美甲', '指甲'] },
      { value: 'コインランドリー', aliases: ['洗衣店', '自助洗衣', '投幣洗衣', '投币洗衣'] },
      { value: 'コインロッカー', aliases: ['寄物櫃', '寄物柜', '置物櫃', '置物柜', '行李櫃', '行李柜'] },
      { value: '荷物預かり', aliases: ['行李寄放', '寄放行李', '行李保管'] },
      { value: 'トイレ', aliases: ['廁所', '厕所', '洗手間', '洗手间'] },

      // ===== 日本：交通 =====
      { value: '駅', aliases: ['車站', '车站', '火車站', '火车站'] },
      { value: '地下鉄駅', aliases: ['地鐵站', '地铁站', '捷運站', '捷运站'] },
      { value: 'JR駅', aliases: ['JR站', 'JR車站', 'JR车站'] },
      { value: 'バス停', aliases: ['公車站', '公交站', '巴士站'] },
      { value: '空港バス', aliases: ['機場巴士', '机场巴士'] },
      { value: 'タクシー', aliases: ['計程車', '计程车', '的士', '出租車', '出租车'] },
      { value: 'レンタカー', aliases: ['租車', '租车'] },
      { value: '駐車場', aliases: ['停車場', '停车场'] },
      { value: 'ガソリンスタンド', aliases: ['加油站'] },

      // ===== 日本：景點 =====
      { value: '観光スポット', aliases: ['景點', '景点', '觀光景點', '观光景点', '旅遊景點', '旅游景点'] },
      { value: '神社', aliases: ['神社'] },
      { value: '寺', aliases: ['寺廟', '寺庙', '寺院'] },
      { value: '城', aliases: ['城堡', '城'] },
      { value: '公園', aliases: ['公園', '公园'] },
      { value: '庭園', aliases: ['庭園', '庭园'] },
      { value: '展望台', aliases: ['觀景台', '观景台', '展望台', '瞭望台'] },
      { value: '夜景', aliases: ['夜景'] },
      { value: '海辺', aliases: ['海邊', '海边'] },
      { value: 'ビーチ', aliases: ['海灘', '海滩', '沙灘', '沙滩'] },
      { value: '水族館', aliases: ['水族館', '水族馆'] },
      { value: '博物館', aliases: ['博物館', '博物馆'] },
      { value: '美術館', aliases: ['美術館', '美术馆'] },
      { value: '動物園', aliases: ['動物園', '动物园'] },
      { value: '遊園地', aliases: ['樂園', '乐园', '遊樂園', '游乐园', '主題樂園', '主题乐园'] },
      { value: '写真スポット', aliases: ['拍照', '打卡', '網美景點', '网美景点', '拍照景點', '拍照景点'] },
      { value: '桜 名所', aliases: ['櫻花', '樱花', '賞櫻', '赏樱'] },
      { value: '紅葉 名所', aliases: ['楓葉', '枫叶', '賞楓', '赏枫', '紅葉', '红叶'] }
    ]
  };

  const PLACE_MAP = {
    ko: [
      // 先列區域，再列城市，避免「弘大烤肉 首爾」被轉成「고기집 서울」而不是「고기집 홍대」。
      { value: '홍대', aliases: ['弘大', '洪大', 'hongdae'] },
      { value: '명동', aliases: ['明洞', 'myeongdong'] },
      { value: '강남', aliases: ['江南', 'gangnam'] },
      { value: '동대문', aliases: ['東大門', '东大门', 'dongdaemun'] },
      { value: '성수', aliases: ['聖水', '圣水', 'seongsu'] },
      { value: '익선동', aliases: ['益善洞', 'ikseondong'] },
      { value: '연남동', aliases: ['延南洞', 'yeonnam'] },
      { value: '이태원', aliases: ['梨泰院', 'itaewon'] },
      { value: '압구정', aliases: ['狎鷗亭', '狎鸥亭', 'apgujeong'] },
      { value: '신촌', aliases: ['新村', 'sinchon'] },
      { value: '종로', aliases: ['鐘路', '钟路', 'jongno'] },
      { value: '북촌', aliases: ['北村', 'bukchon'] },
      { value: '인사동', aliases: ['仁寺洞', 'insadong'] },
      { value: '여의도', aliases: ['汝矣島', '汝矣岛', 'yeouido'] },
      { value: '잠실', aliases: ['蠶室', '蚕室', 'jamsil'] },
      { value: '서울역', aliases: ['首爾站', '首尔站', 'seoul station'] },
      { value: '중문', aliases: ['中文觀光區', '中文观光区', '中文區', '中文区', 'jungmun'] },
      { value: '서귀포', aliases: ['西歸浦', '西归浦', 'seogwipo'] },
      { value: '애월', aliases: ['涯月', '涯月邑', 'aewol'] },
      { value: '성산', aliases: ['城山', 'seongsan'] },
      { value: '협재', aliases: ['挾才', '挟才', 'hyeopjae'] },
      { value: '해운대', aliases: ['海雲台', '海云台', 'haeundae'] },
      { value: '서면', aliases: ['西面', 'seomyeon'] },
      { value: '남포동', aliases: ['南浦洞', 'nampo'] },
      { value: '서울', aliases: ['首爾', '首尔', '서울', 'seoul'] },
      { value: '제주도', aliases: ['濟州島', '济州岛', 'jeju island'] },
      { value: '제주', aliases: ['濟州', '济州', 'jeju'] },
      { value: '부산', aliases: ['釜山', 'busan'] },
      { value: '인천', aliases: ['仁川', 'incheon'] },
      { value: '대구', aliases: ['大邱', 'daegu'] },
      { value: '수원', aliases: ['水原', 'suwon'] }
    ],
    ja: [
      // 先列區域，再列城市。
      { value: '新宿', aliases: ['新宿', 'shinjuku'] },
      { value: '渋谷', aliases: ['澀谷', '涩谷', '渋谷', 'shibuya'] },
      { value: '原宿', aliases: ['原宿', 'harajuku'] },
      { value: '表参道', aliases: ['表參道', '表参道', 'omotesando'] },
      { value: '銀座', aliases: ['銀座', '银座', 'ginza'] },
      { value: '上野', aliases: ['上野', 'ueno'] },
      { value: '浅草', aliases: ['淺草', '浅草', 'asakusa'] },
      { value: '秋葉原', aliases: ['秋葉原', '秋叶原', 'akihabara'] },
      { value: '池袋', aliases: ['池袋', 'ikebukuro'] },
      { value: 'お台場', aliases: ['台場', '台场', '御台場', '御台场', 'odaiba'] },
      { value: '東京駅', aliases: ['東京車站', '东京车站', '東京站', 'tokyo station'] },
      { value: '梅田', aliases: ['梅田', 'umeda'] },
      { value: 'なんば', aliases: ['難波', '难波', 'なんば', 'namba'] },
      { value: '心斎橋', aliases: ['心齋橋', '心斋桥', '心斎橋', 'shinsaibashi'] },
      { value: '道頓堀', aliases: ['道頓堀', '道顿堀', 'dotonbori'] },
      { value: '天王寺', aliases: ['天王寺', 'tennoji'] },
      { value: '新世界', aliases: ['新世界', 'shinsekai'] },
      { value: 'ユニバーサルシティ', aliases: ['環球影城', '环球影城', 'USJ', 'usj', 'universal studios japan'] },
      { value: '祇園', aliases: ['祇園', '祗園', '祇园', 'gion'] },
      { value: '清水寺', aliases: ['清水寺', 'kiyomizudera'] },
      { value: '伏見稲荷', aliases: ['伏見稻荷', '伏见稻荷', 'fushimi inari'] },
      { value: '嵐山', aliases: ['嵐山', '岚山', 'arashiyama'] },
      { value: '河原町', aliases: ['河原町', 'kawaramachi'] },
      { value: '奈良公園', aliases: ['奈良公園', '奈良公园', 'nara park'] },
      { value: '三宮', aliases: ['三宮', '三宫', 'sannomiya'] },
      { value: '元町', aliases: ['元町', 'motomachi'] },
      { value: '東京', aliases: ['東京', '东京', 'tokyo'] },
      { value: '大阪', aliases: ['大阪', 'osaka'] },
      { value: '京都', aliases: ['京都', 'kyoto'] },
      { value: '奈良', aliases: ['奈良', 'nara'] },
      { value: '神戸', aliases: ['神戶', '神户', 'kobe'] },
      { value: '札幌', aliases: ['札幌', 'sapporo'] },
      { value: '沖縄', aliases: ['沖繩', '冲绳', '沖縄', 'okinawa'] },
      { value: '福岡', aliases: ['福岡', '福冈', 'fukuoka'] },
      { value: '名古屋', aliases: ['名古屋', 'nagoya'] }
    ]
  };

  const originalFetch = window.fetch.bind(window);

  function normalizeText(value) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '')
      .replace(/[！!？?。．.，,、]/g, '');
  }

  function findEntry(text, entries) {
    const source = normalizeText(text);
    return (entries || [])
      .map((entry, index) => ({ entry, index }))
      .sort((a, b) => {
        const maxALen = Math.max(...a.entry.aliases.map(x => normalizeText(x).length));
        const maxBLen = Math.max(...b.entry.aliases.map(x => normalizeText(x).length));
        return maxBLen - maxALen || a.index - b.index;
      })
      .find(({ entry }) => entry.aliases.some(alias => source.includes(normalizeText(alias))))?.entry || null;
  }

  function buildMappedTranslation(text, target) {
    const keywordEntry = findEntry(text, KEYWORD_MAP[target]);
    if (!keywordEntry) return null;

    const placeEntry = findEntry(text, PLACE_MAP[target]);
    const keyword = keywordEntry.value;
    const place = placeEntry ? placeEntry.value : '';
    const translatedText = place && !normalizeText(keyword).includes(normalizeText(place))
      ? `${keyword} ${place}`
      : keyword;

    return {
      status: 'ok',
      originalText: text,
      target,
      translatedText,
      detectedSourceLanguage: 'keyword-map',
      keywordMap: {
        keyword,
        keywordAliases: keywordEntry.aliases,
        place,
        placeAliases: placeEntry ? placeEntry.aliases : []
      }
    };
  }

  window.TRAVEL_KEYWORD_MAPS = Object.freeze({ KEYWORD_MAP, PLACE_MAP });

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
