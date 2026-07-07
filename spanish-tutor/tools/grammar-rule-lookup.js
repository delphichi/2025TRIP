/**
 * 假文法規則庫 · Phase 1 用固定資料
 * 涵蓋 6 個西班牙文常見痛點主題
 */

const RULES = {
    'subjuntivo': {
        name: '虛擬式（Modo Subjuntivo）',
        summary: '表達願望、懷疑、情緒、假設、不確定等主觀情境的動詞形式',
        formation: {
            'regular_ar': 'hablar → hable / hables / hable / hablemos / habléis / hablen',
            'regular_er': 'comer → coma / comas / coma / comamos / comáis / coman',
            'regular_ir': 'vivir → viva / vivas / viva / vivamos / viváis / vivan',
            'note': '規則：現在式陳述型 yo 型去掉 -o · 換 ar→e、er/ir→a',
        },
        triggers: [
            'Espero que ...（我希望）',
            'Quiero que ...（我要）',
            'Ojalá ...（希望）',
            'Es posible que ...（可能）',
            'Dudo que ...（我懷疑）',
            'Antes de que ...（在...之前）',
        ],
        examples: [
            'Espero que estés bien.（希望你一切安好。）',
            'Ojalá llueva mañana.（希望明天下雨。）',
            'Quiero que vengas.（我要你來。）',
        ],
        common_mistakes: '虛擬式常用在「que」後面 · 但不是所有 que 都用虛擬式：Sé que viene（我知道他會來 · 陳述）vs Quiero que venga（我希望他來 · 虛擬）',
    },

    'preterito': {
        name: '簡單過去式（Pretérito Indefinido）',
        summary: '表達過去已完成、有明確時間點的動作',
        formation: {
            'regular_ar': 'hablar → hablé / hablaste / habló / hablamos / hablasteis / hablaron',
            'regular_er': 'comer → comí / comiste / comió / comimos / comisteis / comieron',
            'regular_ir': 'vivir → viví / viviste / vivió / vivimos / vivisteis / vivieron',
        },
        triggers: [
            'ayer（昨天）',
            'anoche（昨晚）',
            'la semana pasada（上週）',
            'el año pasado（去年）',
            'hace dos días（兩天前）',
        ],
        examples: [
            'Ayer comí paella.（昨天我吃了海鮮飯。）',
            'El año pasado viajé a España.（去年我去了西班牙旅行。）',
        ],
        common_mistakes: '跟 imperfecto（未完成過去式）常搞混：indefinido 是「一次性、已完成」· imperfecto 是「習慣、背景、狀態」',
    },

    'imperfecto': {
        name: '未完成過去式（Pretérito Imperfecto）',
        summary: '表達過去的習慣、狀態、背景描述',
        formation: {
            'regular_ar': 'hablar → hablaba / hablabas / hablaba / hablábamos / hablabais / hablaban',
            'regular_er_ir': 'comer → comía / comías / comía / comíamos / comíais / comían',
        },
        triggers: [
            'siempre（總是）',
            'todos los días（每天）',
            'cuando era niño（我小時候）',
            'mientras（當...的時候）',
            'a menudo（常常）',
        ],
        examples: [
            'Cuando era niño, jugaba al fútbol.（我小時候踢足球。）',
            'Todos los días comía en casa.（我以前每天在家吃飯。）',
        ],
        common_mistakes: '對比 indefinido：「Ayer comí paella」= 一次性事件 · 「Cuando vivía en España, comía paella cada domingo」= 習慣',
    },

    'ser-estar': {
        name: 'Ser vs Estar · 兩個「是」動詞的差別',
        summary: '西班牙文有兩個「是」· 用法完全不同 · 是初學者最大痛點之一',
        rules: {
            'ser': '表達本質、身分、國籍、職業、日期、時間、材質、擁有者 · 不變的特性',
            'estar': '表達位置、暫時狀態、進行式、感受 · 會變的狀態',
        },
        examples: [
            'Soy taiwanés.（我是台灣人。· 國籍不變 → ser）',
            'Estoy cansado.（我累了。· 暫時狀態 → estar）',
            'La sopa es deliciosa.（湯很好喝。· 本質 → ser · 談這道菜的一般特性）',
            'La sopa está fría.（湯冷了。· 暫時 → estar · 這碗湯現在冷）',
            'Madrid está en España.（馬德里在西班牙。· 位置 → estar）',
        ],
        common_mistakes: '「Soy aburrido」= 我這個人無聊 · 「Estoy aburrido」= 我覺得無聊。差一個字意思完全不同！',
    },

    'por-para': {
        name: 'Por vs Para · 兩個介系詞的差別',
        summary: '中文都可翻「為了、因為」· 但用法不同',
        rules: {
            'por': '原因、經由、交換、時段、被動語態的 agent',
            'para': '目的、去向、期限、對象、意圖',
        },
        examples: [
            'Trabajo por dinero.（我為了錢工作。· 原因 → por）',
            'Trabajo para pagar la renta.（我工作是為了付房租。· 目的 → para）',
            'Este regalo es para ti.（這個禮物給你的。· 對象 → para）',
            'Gracias por tu ayuda.（謝謝你的幫忙。· 原因 → por）',
            'Salimos para Madrid mañana.（我們明天出發去馬德里。· 去向 → para）',
        ],
        common_mistakes: '記憶法：por = 「因為/透過」· para = 「為了/朝向」',
    },

    'gustar': {
        name: 'Gustar 型動詞 · 反向主詞句型',
        summary: 'gustar 及類似動詞（encantar/interesar/molestar 等）· 主詞是「被喜歡的東西」· 不是「喜歡的人」· 動詞跟事物變化',
        rules: {
            'core': '中文「我喜歡咖啡」→ 西文邏輯「咖啡令我愉快」· 主詞是咖啡 · 我是間接受詞',
            'agreement': '單數 → gusta · 複數 → gustan · 動詞原形 → gusta',
            'pronoun': '間接受詞代名詞：me / te / le / nos / os / les（我/你/他她您/我們/你們/他們）',
            'emphasis': '可加「a + 人」強調對象：A ella le gusta el café.',
        },
        formation: {
            'singular': 'Me gusta el café.（我喜歡咖啡。· el café 單數 → gusta）',
            'plural':   'Me gustan los perros.（我喜歡狗。· los perros 複數 → gustan）',
            'infinitive': 'Me gusta bailar.（我喜歡跳舞。· 原形視為單數 → gusta）',
        },
        similar_verbs: [
            'encantar（超喜歡）',
            'interesar（讓…感興趣）',
            'molestar（讓…困擾）',
            'doler（讓…痛 · Me duele la cabeza）',
            'faltar（缺 · Me faltan dos euros）',
            'parecer（覺得 · Me parece bien）',
        ],
        examples: [
            'Me gusta el café.（我喜歡咖啡。）',
            'Me gustan los libros.（我喜歡書。· 複數）',
            '¿Te gusta bailar?（你喜歡跳舞嗎？· 原形）',
            'A ella le gustan las películas.（她喜歡電影。· 強調對象）',
            'Me encanta este restaurante.（我超愛這家餐廳。· encantar 同型）',
        ],
        common_mistakes: '最大陷阱：× Yo gusto el café · ○ Me gusta el café。動詞永遠跟「被喜歡的東西」變 · 不跟人。',
    },

    'imperativo': {
        name: '命令式（Imperativo）',
        summary: '對他人下指令、要求、建議',
        formation: {
            'tu_positivo': 'hablar → habla（規則：現在式第三人稱單數）',
            'usted_positivo': 'hablar → hable（同虛擬式）',
            'tu_negativo': 'hablar → no hables（用虛擬式）',
        },
        examples: [
            '¡Habla más despacio!（說慢一點！）',
            '¡Ven aquí!（過來這裡！· venir 不規則）',
            'No hables tan rápido.（不要說這麼快。）',
            'Coma, por favor.（請吃。· usted 正式）',
        ],
        common_mistakes: '否定命令的 tú 型別用陳述現在式（× no hablas）· 要用虛擬式（○ no hables）',
    },
};

/**
 * @param {{ grammar_topic: string }} input
 * @returns {string} JSON string 給 Claude 消化
 */
export function grammarRuleLookup(input) {
    const raw = String(input.grammar_topic || '').toLowerCase().trim();
    // 允許幾種常見寫法
    const key = raw
        .replace(/pretérito|preterite|preterito/g, 'preterito')
        .replace(/imperfect(o)?/g, 'imperfecto')
        .replace(/subjunctive|subjuntivo|virtual/g, 'subjuntivo')
        .replace(/ser\s*(vs|and|y)\s*estar|ser-estar|ser_estar/g, 'ser-estar')
        .replace(/por\s*(vs|and|y)\s*para|por-para|por_para/g, 'por-para')
        .replace(/imperative|命令/g, 'imperativo')
        .replace(/gustar-type|reverse-subject|verbo-gustar|喜歡型/g, 'gustar');

    const rule = RULES[key];
    if (!rule) {
        return JSON.stringify({
            found: false,
            topic: raw,
            message: `「${raw}」不在假規則庫（Phase 1 只有 6 個主題：subjuntivo, preterito, imperfecto, ser-estar, por-para, imperativo）`,
            available_topics: Object.keys(RULES),
        });
    }
    return JSON.stringify({ found: true, topic: key, ...rule });
}
