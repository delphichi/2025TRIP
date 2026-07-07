/**
 * 假字典 · Phase 1 用固定資料 · 之後 Phase 4 換真 API
 *
 * 查不到的字回傳「不在字典裡」訊息 · agent 拿到後會告訴使用者
 */

const DICT = {
    querer: {
        pos: '動詞（不規則現在式）',
        meaning: '想要、愛',
        conjugations: {
            presente: 'quiero / quieres / quiere / queremos / queréis / quieren',
            preterito: 'quise / quisiste / quiso / quisimos / quisisteis / quisieron',
        },
        examples: [
            'Quiero un café.（我想要一杯咖啡。）',
            'Te quiero.（我愛你。）',
            'Quiero aprender español.（我想學西班牙文。）',
        ],
        notes: '「Te quiero」通常對家人、朋友、伴侶 · 比「Te amo」情感較廣。',
    },
    aprender: {
        pos: '動詞（規則 -er）',
        meaning: '學習',
        conjugations: {
            presente: 'aprendo / aprendes / aprende / aprendemos / aprendéis / aprenden',
        },
        examples: [
            'Aprendo español.（我學西班牙文。）',
            'Aprender es divertido.（學習很有趣。）',
        ],
        notes: '常見句型「aprender a + 原形動詞」= 學做某事',
    },
    ser: {
        pos: '動詞（不規則現在式）· 「是」（本質性）',
        meaning: '是（表達身分、國籍、職業、本質特性）',
        conjugations: {
            presente: 'soy / eres / es / somos / sois / son',
        },
        examples: [
            'Soy taiwanés.（我是台灣人。）',
            'Ella es doctora.（她是醫生。）',
        ],
        notes: '與 estar 差別：ser = 本質不變、estar = 狀態暫時。用 grammar_rule_lookup("ser-estar") 查詳細。',
    },
    estar: {
        pos: '動詞（不規則現在式）· 「是/在」（狀態性）',
        meaning: '是、在（表達位置、狀態、感受）',
        conjugations: {
            presente: 'estoy / estás / está / estamos / estáis / están',
        },
        examples: [
            'Estoy cansado.（我累了。）',
            'Madrid está en España.（馬德里在西班牙。）',
        ],
        notes: '與 ser 差別：estar 用於暫時狀態、位置。',
    },
    hablar: {
        pos: '動詞（規則 -ar）',
        meaning: '說、談話',
        conjugations: {
            presente: 'hablo / hablas / habla / hablamos / habláis / hablan',
        },
        examples: [
            '¿Hablas español?（你會說西班牙文嗎？）',
            'Habla más despacio, por favor.（請說慢一點。）',
        ],
    },
    comer: {
        pos: '動詞（規則 -er）',
        meaning: '吃',
        conjugations: {
            presente: 'como / comes / come / comemos / coméis / comen',
        },
        examples: [
            '¿Qué quieres comer?（你想吃什麼？）',
            'Comemos a las dos.（我們兩點吃飯。）',
        ],
    },
    tener: {
        pos: '動詞（不規則現在式）',
        meaning: '有、擁有',
        conjugations: {
            presente: 'tengo / tienes / tiene / tenemos / tenéis / tienen',
        },
        examples: [
            'Tengo 25 años.（我 25 歲。）',
            'Tengo hambre.（我餓了。）',
        ],
        notes: '常用片語：tener + 名詞 表達生理/情緒 · 例如 tener frío/calor/miedo/sueño',
    },
    ir: {
        pos: '動詞（極不規則）',
        meaning: '去',
        conjugations: {
            presente: 'voy / vas / va / vamos / vais / van',
        },
        examples: [
            'Voy a casa.（我要回家。）',
            'Vamos a estudiar.（我們要去學習/我們準備學習。）',
        ],
        notes: '「ir a + 原形」表達不久後的未來 · 相當於英文 be going to。',
    },
    hacer: {
        pos: '動詞（不規則現在式）',
        meaning: '做、製作',
        conjugations: {
            presente: 'hago / haces / hace / hacemos / hacéis / hacen',
        },
        examples: [
            '¿Qué haces?（你在做什麼？）',
            'Hace calor hoy.（今天很熱。）',
        ],
        notes: '天氣句型「Hace + calor/frío/sol/viento」= 天氣如何',
    },
    hola: {
        pos: '感嘆詞',
        meaning: '你好、嗨',
        examples: [
            '¡Hola! ¿Cómo estás?（嗨！你好嗎？）',
        ],
        notes: '最基本的問候 · 一天任何時間都可用。',
    },
    gracias: {
        pos: '感嘆詞 / 名詞（陰性複數）',
        meaning: '謝謝',
        examples: [
            'Muchas gracias.（非常感謝。）',
            'Gracias por tu ayuda.（謝謝你的幫忙。）',
        ],
    },
    'buenos días': {
        pos: '慣用語',
        meaning: '早安',
        examples: [
            '¡Buenos días! ¿Cómo estás?（早安！你好嗎？）',
        ],
        notes: '中午前用。中午到晚上前用 buenas tardes、晚上用 buenas noches。',
    },
};

/**
 * @param {{ word: string, context?: string }} input
 * @returns {string} JSON string 給 Claude 消化
 */
export function dictionaryLookup(input) {
    const word = String(input.word || '').toLowerCase().trim();
    const entry = DICT[word];
    if (!entry) {
        return JSON.stringify({
            found: false,
            word,
            message: `「${word}」不在假字典裡（Phase 1 只有 12 個常用字：querer, aprender, ser, estar, hablar, comer, tener, ir, hacer, hola, gracias, buenos días）· 之後 Phase 4 會接真 API`,
        });
    }
    return JSON.stringify({
        found: true,
        word,
        ...entry,
    });
}
