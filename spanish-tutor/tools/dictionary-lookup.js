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
    esperar: {
        pos: '動詞（規則 -ar）',
        meaning: '希望、期待、等待',
        conjugations: {
            presente: 'espero / esperas / espera / esperamos / esperáis / esperan',
            subjuntivo: 'espere / esperes / espere / esperemos / esperéis / esperen',
        },
        examples: [
            'Espero que estés bien.（希望你一切安好。· 後接虛擬式）',
            'Te espero en la estación.（我在車站等你。· 後接直述式）',
            'Espero verte pronto.（希望很快見到你。· 同主詞用不定詞）',
        ],
        notes: '同時表達「希望」與「等待」· 語意由上下文決定 · 是虛擬式最常見的觸發動詞之一。',
    },
    ojalá: {
        pos: '感嘆詞 / 副詞（源自阿拉伯文 wa šā llāh · 「若真主願意」）',
        meaning: '但願、希望',
        conjugations: null,
        examples: [
            'Ojalá llueva mañana.（希望明天下雨。· 後直接接虛擬式 · 不加 que）',
            'Ojalá pudieras venir.（真希望你能來。· 過去虛擬式表較不可能）',
            'Ojalá que sí.（希望是。· 加 que 也可以 · 較口語）',
        ],
        notes: 'ojalá 是虛擬式最重要的觸發詞之一 · 後面幾乎一定接虛擬式 · 表達強烈願望 · 可加或不加 que。',
    },
    dudar: {
        pos: '動詞（規則 -ar）',
        meaning: '懷疑、質疑',
        conjugations: {
            presente: 'dudo / dudas / duda / dudamos / dudáis / dudan',
        },
        examples: [
            'Dudo que sea verdad.（我懷疑這是真的。· 後接虛擬式）',
            'No dudo que viene.（我不懷疑他會來 · 用直述式 · 因為 no dudar = 確信）',
        ],
        notes: 'dudar que 表達不確定 · 觸發虛擬式；否定的 no dudar que 反而觸發直述式（因語意反轉為肯定）。',
    },
    poder: {
        pos: '動詞（不規則 · e→ue 詞根變化）',
        meaning: '能、可以',
        conjugations: {
            presente: 'puedo / puedes / puede / podemos / podéis / pueden',
            subjuntivo: 'pueda / puedas / pueda / podamos / podáis / puedan',
            preterito: 'pude / pudiste / pudo / pudimos / pudisteis / pudieron',
        },
        examples: [
            '¿Puedes ayudarme?（你可以幫我嗎？）',
            'Ojalá puedas venir.（希望你能來。· 虛擬式）',
            'No puedo dormir.（我睡不著。）',
        ],
        notes: 'poder + 原形動詞 = 表達能力或許可 · 高頻搭配「Quiero que puedas...」用虛擬式。',
    },
    venir: {
        pos: '動詞（不規則 · 詞根 ven-/vien-/veng-）',
        meaning: '來',
        conjugations: {
            presente: 'vengo / vienes / viene / venimos / venís / vienen',
            subjuntivo: 'venga / vengas / venga / vengamos / vengáis / vengan',
            preterito: 'vine / viniste / vino / vinimos / vinisteis / vinieron',
        },
        examples: [
            'Ven aquí.（過來這裡。· 命令式）',
            'Quiero que vengas.（我要你來。· 虛擬式）',
            'Vengo de Taiwán.（我來自台灣。）',
        ],
        notes: 'venir 的 yo 型是 vengo · 虛擬式就從這個 -o 去掉推：venga / vengas...',
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
            message: `「${word}」不在假字典裡（目前收錄 ${Object.keys(DICT).length} 個字：${Object.keys(DICT).join(', ')}）· 之後 Phase 4 會接真 API`,
            available_words: Object.keys(DICT),
        });
    }
    return JSON.stringify({
        found: true,
        word,
        ...entry,
    });
}
