const APP_STORAGE_SCHEMA_KEY = 'sampire-storage-schema-version';
const APP_STORAGE_SCHEMA_VERSION = '2026-03-08.1';

function migrateStorageSchemaOnce() {
    // Stamp the schema version only. Never delete player data here: an earlier
    // version wiped every sampire-* key, destroying progress for returning players.
    try {
        if (localStorage.getItem(APP_STORAGE_SCHEMA_KEY) === APP_STORAGE_SCHEMA_VERSION) return;
        localStorage.setItem(APP_STORAGE_SCHEMA_KEY, APP_STORAGE_SCHEMA_VERSION);
    } catch (e) {
        // If storage is unavailable, continue boot without migration.
    }
}

migrateStorageSchemaOnce();

// ── Content ────────────────────────────────────────────────────────────────
const QUOTES = [
    // ── Star Wars ──────────────────────────────────────────────────────────
    { text: "Do or do not. There is no try.",
      source: "Yoda — Star Wars: The Empire Strikes Back" },
    { text: "May the Force be with you.",
      source: "Han Solo — Star Wars: A New Hope" },
    { text: "The Force will be with you. Always.",
      source: "Obi-Wan Kenobi — Star Wars: A New Hope" },
    { text: "In my experience, there is no such thing as luck.",
      source: "Obi-Wan Kenobi — Star Wars: A New Hope" },
    { text: "Your focus determines your reality.",
      source: "Qui-Gon Jinn — Star Wars: The Phantom Menace" },
    { text: "Fear is the path to the dark side. Fear leads to anger. Anger leads to hate. Hate leads to suffering.",
      source: "Yoda — Star Wars: The Phantom Menace" },
    { text: "Wars not make one great.",
      source: "Yoda — Star Wars: The Empire Strikes Back" },
    { text: "The greatest teacher, failure is.",
      source: "Yoda — Star Wars: The Last Jedi" },
    { text: "Named must your fear be before banish it you can.",
      source: "Yoda — Star Wars: The Empire Strikes Back" },
    { text: "Never tell me the odds!",
      source: "Han Solo — Star Wars: The Empire Strikes Back" },
    { text: "I find your lack of faith disturbing.",
      source: "Darth Vader — Star Wars: A New Hope" },
    { text: "I am one with the Force, and the Force is with me.",
      source: "Chirrut Imwe — Star Wars: Rogue One" },
    { text: "This is the way.",
      source: "The Mandalorian — The Mandalorian" },
    { text: "You were the chosen one! It was said that you would destroy the Sith, not join them!",
      source: "Obi-Wan Kenobi — Star Wars: Revenge of the Sith" },
    { text: "Help me, Obi-Wan Kenobi. You're my only hope.",
      source: "Princess Leia — Star Wars: A New Hope" },
    { text: "Strike me down and I will become more powerful than you can possibly imagine.",
      source: "Obi-Wan Kenobi — Star Wars: A New Hope" },
    { text: "It's a trap!",
      source: "Admiral Ackbar — Star Wars: Return of the Jedi" },
    { text: "I've got a bad feeling about this.",
      source: "Various characters — Star Wars" },
    { text: "No. I am your father.",
      source: "Darth Vader — Star Wars: The Empire Strikes Back" },
    { text: "To be Jedi is to face the truth and choose. Give off light or darkness.",
      source: "Yoda — Star Wars: Yoda: Dark Rendezvous" },
    // ── The Lord of the Rings ───────────────────────────────────────────────
    { text: "All we have to decide is what to do with the time that is given us.",
      source: "Gandalf — The Lord of the Rings: The Fellowship of the Ring" },
    { text: "Even the smallest person can change the course of the future.",
      source: "Galadriel — The Lord of the Rings: The Fellowship of the Ring" },
    { text: "Not all those who wander are lost.",
      source: "Bilbo Baggins — The Lord of the Rings: The Fellowship of the Ring" },
    { text: "There is some good in this world, and it is worth fighting for.",
      source: "Samwise Gamgee — The Lord of the Rings: The Two Towers" },
    { text: "It's a dangerous business, Frodo, going out your door. You step onto the road, and if you don't keep your feet, there is no knowing where you might be swept off to.",
      source: "Bilbo Baggins — The Lord of the Rings: The Fellowship of the Ring" },
    { text: "Even darkness must pass. A new day will come. And when the sun shines it will shine out the clearer.",
      source: "Samwise Gamgee — The Lord of the Rings: The Two Towers" },
    { text: "I wish it need not have happened in my time.",
      source: "Frodo Baggins — The Lord of the Rings: The Fellowship of the Ring" },
    { text: "End? No, the journey doesn't end here. Death is just another path, one that we all must take.",
      source: "Gandalf — The Lord of the Rings: The Return of the King" },
    { text: "Many that live deserve death. And some that die deserve life. Can you give it to them? Then do not be too eager to deal out death in judgement.",
      source: "Gandalf — The Lord of the Rings: The Fellowship of the Ring" },
    { text: "I will take the Ring, though I do not know the way.",
      source: "Frodo Baggins — The Lord of the Rings: The Fellowship of the Ring" },
    { text: "Faithless is he that says farewell when the road darkens.",
      source: "Gimli — The Lord of the Rings: The Fellowship of the Ring" },
    { text: "You shall not pass!",
      source: "Gandalf — The Lord of the Rings: The Fellowship of the Ring" },
    { text: "I would rather share one lifetime with you than face all the ages of this world alone.",
      source: "Arwen — The Lord of the Rings: The Fellowship of the Ring" },
    { text: "Courage is found in unlikely places.",
      source: "Gildor — The Lord of the Rings: The Fellowship of the Ring" },
    { text: "All that is gold does not glitter, not all those who wander are lost; the old that is strong does not wither, deep roots are not reached by the frost.",
      source: "Bilbo Baggins — The Lord of the Rings: The Fellowship of the Ring" },
];

// ── Word lists ─────────────────────────────────────────────────────────────
// "common": the 200 most common English words (same set Monkeytype's default English list uses).
const WORD_LIST_COMMON = [
    'the','be','of','and','a','to','in','he','have','it','that','for','they','I','with','as','not','on','she','at',
    'by','this','we','you','do','but','from','or','which','one','would','all','will','there','say','who','make','when','can','more',
    'if','no','man','out','other','so','what','time','up','go','about','than','into','could','state','only','new','year','some','take',
    'come','these','know','see','use','get','like','then','first','any','work','now','may','such','give','over','think','most','even','find',
    'day','also','after','way','many','must','look','before','great','back','through','long','where','much','should','well','people','down','own','just',
    'because','good','each','those','feel','seem','how','high','too','place','little','world','very','still','nation','hand','old','life','tell','write',
    'become','here','show','house','both','between','need','mean','call','develop','under','last','right','move','thing','general','school','never','same','another',
    'begin','while','number','part','turn','real','leave','might','want','point','form','off','child','few','small','since','against','ask','late','home',
    'interest','large','person','end','open','public','follow','during','present','without','again','hold','govern','around','possible','head','consider','word','program','problem',
    'however','lead','system','set','order','eye','plan','run','keep','face','fact','group','play','stand','increase','early','course','change','help','line',
];
// "wide": the common list plus about 900 more everyday words.
const WORD_LIST_EXTRA = [
    'able','accept','account','act','action','active','actually','add','address','admit','adult','affect','afternoon','agree','ahead','allow','almost','alone','already','although',
    'among','amount','animal','annual','answer','anyone','anything','apart','appear','apple','apply','area','argue','arm','army','arrive','art','article','attack','attention',
    'author','available','avoid','awake','aware','away','baby','bad','bag','ball','bank','bar','base','basic','bath','beach','bear','beat','beautiful','bed',
    'beer','behind','believe','below','benefit','beside','better','beyond','big','bill','bird','birth','bit','black','blood','blow','blue','board','boat','body',
    'bone','book','born','bottle','bottom','box','boy','brain','branch','bread','break','breath','bridge','brief','bright','bring','broad','brother','brown','budget',
    'build','burn','bus','business','busy','buy','cake','camera','camp','candidate','capital','car','card','care','career','carry','case','cat','catch','cause',
    'cell','center','central','century','certain','chair','chance','character','charge','cheap','check','chest','chief','choice','choose','church','circle','citizen','city','civil',
    'claim','class','clean','clear','climb','clock','close','clothes','cloud','coach','coast','coat','code','coffee','cold','collect','college','color','column','comfort',
    'common','company','compare','complete','computer','concern','condition','conference','confirm','connect','contain','content','continue','control','cook','cool','copy','corner','correct','cost',
    'count','country','couple','cousin','cover','create','crime','cross','crowd','cry','culture','cup','current','customer','cut','dad','dance','danger','dark','data',
    'date','daughter','dead','deal','dear','death','debate','decade','decide','decision','deep','defense','degree','deliver','demand','depend','describe','design','desk','despite',
    'detail','determine','device','die','difference','different','difficult','dinner','direct','direction','dirty','discover','discuss','disease','distance','doctor','dog','door','double','doubt',
    'draw','dream','dress','drink','drive','drop','dry','due','dust','ear','earth','east','easy','eat','economy','edge','effect','effort','egg','eight',
    'either','elect','else','employ','empty','energy','engine','enjoy','enough','enter','entire','environment','equal','error','escape','especially','event','ever','every','evidence',
    'exact','example','except','exchange','exist','expect','experience','expert','explain','express','extra','factor','fail','fair','fall','false','family','famous','far','farm',
    'fast','fat','father','fear','feed','field','fight','figure','file','fill','film','final','finger','finish','fire','firm','fish','fit','five','fix',
    'flat','floor','flow','flower','fly','focus','food','foot','force','foreign','forest','forget','forward','four','free','fresh','friend','front','fruit','fuel',
    'full','fun','future','game','garden','gas','gate','gather','gift','girl','glass','goal','gold','gone','grass','gray','green','ground','grow','guard',
    'guess','guest','guide','gun','hair','half','hall','happen','happy','hard','hat','hate','health','hear','heart','heat','heavy','height','hello','hero',
    'hide','hill','history','hit','hole','holiday','hope','horse','hospital','hot','hotel','hour','huge','human','hundred','hurt','husband','ice','idea','identify',
    'image','imagine','impact','important','improve','include','income','indeed','indicate','industry','inform','inside','instead','involve','iron','island','issue','item','job','join',
    'joke','joy','judge','jump','key','kick','kid','kill','kind','king','kitchen','knee','knife','knock','knowledge','lack','lady','lake','land','language',
    'laugh','law','lay','layer','learn','least','left','leg','legal','less','lesson','letter','level','lie','light','likely','limit','list','listen','local',
    'lock','lose','loss','lot','loud','love','low','luck','lunch','machine','magazine','main','major','manage','map','mark','market','marry','mass','master',
    'match','material','matter','maybe','meal','measure','meat','media','medical','meet','member','memory','mention','message','metal','method','middle','mile','milk','million',
    'mind','minute','miss','mistake','mix','model','modern','moment','money','month','moon','morning','mother','motor','mountain','mouse','mouth','movie','music','name',
    'narrow','natural','nature','near','nearly','neck','network','news','next','nice','night','nine','noise','none','nor','normal','north','nose','note','nothing',
    'notice','novel','object','occur','ocean','offer','office','officer','official','often','oil','okay','once','onto','operate','opinion','option','orange','organize','original',
    'others','ought','outside','owner','page','pain','paint','pair','paper','parent','park','particular','party','pass','past','path','patient','pattern','pay','peace',
    'pen','pepper','perfect','perform','perhaps','period','pick','picture','piece','pink','plane','plant','plastic','plate','player','please','pocket','poem','police','policy',
    'poor','popular','position','positive','pound','power','practice','prepare','press','pressure','pretty','prevent','price','pride','print','private','prize','process','produce','product',
    'profit','project','promise','proof','property','protect','proud','prove','provide','pull','purpose','push','put','quality','quarter','question','quick','quiet','quite','race',
    'radio','rain','raise','range','rate','rather','reach','read','ready','reason','receive','recent','record','red','reduce','refer','reflect','region','relate','release',
    'remain','remember','remove','repeat','reply','report','require','research','respect','respond','rest','result','return','reveal','rich','ride','ring','rise','risk','river',
    'road','rock','role','roll','roof','room','root','rose','rough','round','route','row','rule','rush','sad','safe','sail','salt','sand','save',
    'scene','science','score','screen','sea','search','season','seat','second','secret','section','sector','secure','seed','sell','send','sense','sentence','separate','series',
    'serious','serve','service','seven','several','shade','shake','shape','share','sharp','sheet','shift','shine','ship','shirt','shoe','shoot','shop','short','shoulder',
    'shout','side','sign','silver','similar','simple','sing','single','sister','sit','site','six','size','skill','skin','sky','sleep','slip','slow','smart',
    'smell','smile','smoke','snow','social','society','soft','soil','soldier','solid','solve','son','song','soon','sorry','sort','sound','soup','source','south',
    'space','speak','special','speech','speed','spend','spirit','sport','spot','spread','spring','square','staff','stage','stair','star','start','station','stay','steal',
    'step','stick','stock','stomach','stone','stop','store','storm','story','straight','strange','street','stress','stretch','strike','strong','structure','student','study','stuff',
    'style','subject','succeed','success','sudden','suffer','sugar','suggest','suit','summer','sun','supply','support','suppose','sure','surface','surprise','survive','sweet','swim',
    'switch','symbol','table','tail','talk','tall','task','taste','tax','tea','teach','team','tear','teeth','ten','term','test','text','thank','theory',
    'thick','thin','third','though','thought','thousand','threat','three','throw','ticket','tie','tight','till','tiny','tip','tire','title','today','together','tomorrow',
    'tone','tongue','tonight','tool','tooth','top','total','touch','toward','tower','town','track','trade','traffic','train','travel','treat','tree','trial','trip',
    'trouble','truck','true','trust','truth','try','tune','twelve','twenty','twice','two','type','uncle','understand','union','unit','unless','until','upon','upper',
    'usual','valley','value','various','vehicle','version','victory','view','village','visit','voice','vote','wage','wait','wake','walk','wall','war','warm','warn',
    'wash','waste','watch','water','wave','weak','wealth','weapon','wear','weather','wedding','week','weight','welcome','west','wet','wheel','whether','white','whole',
    'whose','wide','wife','wild','win','wind','window','wine','wing','winter','wire','wise','wish','within','woman','wonder','wood','wool','worry','worth',
    'wrong','yard','yellow','yes','yesterday','yet','young','youth','zero','zone','across','afraid','agent','alive','ancient','angle','angry','ankle','anxious','apartment',
    'arrange','asleep','attend','autumn','average','awful','balance','basket','battle','beauty','behave','belong','bitter','blame','blind','block','bold','border','borrow','brave',
    'breakfast','bubble','bucket','butter','button','cabin','calm','candle','carpet','castle','ceiling','chain','chapter','cheese','cherry','chicken','chip','clever','cliff','coin',
    'collar','comb','cotton','cousin','crack','crazy','cream','crisp','curtain','curve','cycle','daily','damage','dawn','deck','deer','delay','dentist','desert','diamond',
    'dish','dolphin','dozen','drawer','drum','duck','eager','eagle','elbow','elder','elephant','engineer','evening','exit','fabric','fence','ferry','fever','finance','flag',
    'flame','flash','flight','float','flood','fold','forgive','fork','fortune','fountain','fox','frame','frog','frost','frozen','gallery','garage','gentle','giant','ginger',
    'glove','goat','golden','grade','grain','grape','gravity','grief','grocery','guitar','hammer','handle','harbor','harvest','helmet','honest','honey','hook','humble','hunger',
    'hunt','icon','insect','invite','jacket','jar','jelly','jewel','journey','juice','jungle','kettle','label','ladder','lamp','lantern','lawn','lazy','leaf','lemon',
    'lend','lens','library','lion','liquid','lively','lizard','lobby','lonely','lucky','magic','mail','mammal','marble','meadow','medal','melt','mercy','merry','mirror',
    'mist','monkey','mosquito','muscle','mushroom','nail','napkin','needle','nest','noble','noodle','nurse','oak','oar','oasis','obey','olive','onion','orbit','orchard',
    'oven','owl','oxygen','pack','paddle','palace','palm','panic','parcel','pasta','pause','pearl','pebble','pencil','penguin','petal','pigeon','pillow','pilot','pine',
    'pipe','pirate','pizza','planet','plug','plum','polish','pond','pony','porch','potato','pour','powder','puppy','puzzle','rabbit','rail','ranch','rapid','raven',
    'razor','recipe','reef','relax','rescue','ribbon','rice','ripe','robot','rocket','rope','rubber','ruby','sack','saddle','sailor','salad','sample','sauce','scale',
    'scarf','scatter','scissors','seal','shadow','shallow','shark','shell','shelter','shield','shower','silk','sink','skate','sketch','slice','slide','sneeze','sock','sofa',
    'spade','spark','spider','spill','sponge','spoon','squirrel','stable','stamp','steam','steel','stem','sting','stir','stove','strap','straw','stream','stripe','sunset',
    'swamp','swan','sweep','sword','syrup','tablet','tank','tape','target','teapot','tent','thread','thunder','tide','tiger','timber','toast','tomato','torch','towel',
    'toy','trail','tray','tribe','trophy','trumpet','tulip','tunnel','turkey','turtle','twig','umbrella','vacuum','vanish','vase','velvet','vest','violin','volcano','wagon',
    'walnut','wander','wardrobe','wasp','weave','weed','whale','wheat','whisper','whistle','willow','wink','wizard','wrist','yawn','yogurt','zebra','zipper',
];
const WORD_LIST_WIDE = Array.from(new Set(WORD_LIST_COMMON.concat(WORD_LIST_EXTRA)));
// Kept for the other modes (Orion, Lyra, Weak keys drills) which take a word pool.
const WORD_LIST = WORD_LIST_WIDE;

// ── Seeded random numbers (so a test can be reproduced from its seed) ──────
function makeSeededRng(seed) {
    let a = (Number(seed) >>> 0);
    return function () {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
function makeRandomSeed() {
    try {
        if (window.crypto && crypto.getRandomValues) {
            const buf = new Uint32Array(1);
            crypto.getRandomValues(buf);
            return buf[0] >>> 0;
        }
    } catch (e) {}
    return Math.floor(Math.random() * 4294967296) >>> 0;
}
let currentTestSeed = 0;
let testRng = Math.random;
const wordGenState = { lastWord: '', capitalizeNext: true };

function getActiveWordList() {
    return engineOptions.wordList === 'wide' ? WORD_LIST_WIDE : WORD_LIST_COMMON;
}

function generateWord(rng = testRng) {
    const list = getActiveWordList();
    let word = list[Math.floor(rng() * list.length)];
    if (word === wordGenState.lastWord && list.length > 1) word = list[(list.indexOf(word) + 1) % list.length];
    wordGenState.lastWord = word;
    return word;
}

function applyPunctuationToWord(word, rng, state, isLast) {
    let w = word;
    if (state.capitalizeNext && /^[a-z]/.test(w)) w = w[0].toUpperCase() + w.slice(1);
    state.capitalizeNext = false;
    const r = rng();
    if (r < 0.09)      { w += '.'; state.capitalizeNext = true; }
    else if (r < 0.21) { w += ','; }
    else if (r < 0.24) { w += '?'; state.capitalizeNext = true; }
    else if (r < 0.26) { w += '!'; state.capitalizeNext = true; }
    else if (r < 0.28) { w += ';'; }
    else if (r < 0.30) { w += ':'; }
    else if (r < 0.33) { w = '"' + w + '"'; }
    else if (r < 0.35) { w = "'" + w + "'"; }
    else if (r < 0.37) { w = '(' + w + ')'; }
    else if (r < 0.39 && /^[a-z]+$/i.test(word)) { w += "'s"; }
    else if (r < 0.41) { w += ' -'; }
    if (isLast && !/[.!?]$/.test(w)) w += '.';
    return w;
}

// Builds a run of words from the current seed. `final` marks the end of a fixed-length test.
function generateWordTest(count = 40, { rng = testRng, opts = engineOptions, final = false } = {}) {
    const words = [];
    for (let i = 0; i < count; i++) {
        let w = generateWord(rng);
        if (opts.numbers && rng() < 0.1) {
            w = String(Math.floor(rng() * (rng() < 0.5 ? 100 : 10000)));
        }
        if (opts.punctuation) w = applyPunctuationToWord(w, rng, wordGenState, final && i === count - 1);
        words.push(w);
    }
    return words.join(' ');
}

function resetWordGenerator(seed) {
    currentTestSeed = (Number(seed) >>> 0);
    testRng = makeSeededRng(currentTestSeed);
    wordGenState.lastWord = '';
    wordGenState.capitalizeNext = true;
}

function getCurrentTestSeed() { return currentTestSeed; }
window.getCurrentTestSeed = getCurrentTestSeed;
function getCurrentTestSpec() {
    return { seed: currentTestSeed, mode: currentMode, options: Object.assign({}, engineOptions) };
}
window.getCurrentTestSpec = getCurrentTestSpec;

// ── Engine options (persisted) ─────────────────────────────────────────────
const ENGINE_OPTIONS_KEY = 'sampire-engine-options';
const ENGINE_OPTION_DEFAULTS = Object.freeze({
    time: 30,            // timed mode length in seconds
    words: 25,           // words-mode length
    punctuation: false,
    numbers: false,
    wordList: 'common',  // 'common' (200) or 'wide' (about 1000)
    caret: 'line',       // block | line | underline | off
    smoothCaret: true,
    liveStats: true,
    liveChart: false,
    stopOnError: 'off',  // off | letter | word
    strictBackspace: false,
});
const ENGINE_OPTION_CHOICES = {
    time: [15, 30, 60, 120],
    words: [10, 25, 50, 100],
    wordList: ['common', 'wide'],
    caret: ['block', 'line', 'underline', 'off'],
    stopOnError: ['off', 'letter', 'word'],
};
const ENGINE_TEXT_OPTIONS = ['time', 'words', 'punctuation', 'numbers', 'wordList'];
const engineOptions = Object.assign({}, ENGINE_OPTION_DEFAULTS);

function sanitizeEngineOption(name, value) {
    if (!(name in ENGINE_OPTION_DEFAULTS)) return undefined;
    const def = ENGINE_OPTION_DEFAULTS[name];
    if (typeof def === 'boolean') return value === true || value === 'true' || value === 1 || value === '1';
    const choices = ENGINE_OPTION_CHOICES[name];
    if (typeof def === 'number') {
        const n = Number(value);
        return choices.includes(n) ? n : def;
    }
    return choices.includes(value) ? value : def;
}

function loadEngineOptions() {
    let stored = null;
    try { stored = JSON.parse(localStorage.getItem(ENGINE_OPTIONS_KEY) || 'null'); } catch (e) { stored = null; }
    if (stored && typeof stored === 'object') {
        for (const name of Object.keys(ENGINE_OPTION_DEFAULTS)) {
            if (name in stored) engineOptions[name] = sanitizeEngineOption(name, stored[name]);
        }
    }
    applyTimedDuration();
}

function saveEngineOptions() {
    try { localStorage.setItem(ENGINE_OPTIONS_KEY, JSON.stringify(engineOptions)); } catch (e) {}
}

function applyTimedDuration() {
    RANDOM_WORDS_DURATION = engineOptions.time;
}

function getEngineOption(name) { return engineOptions[name]; }
window.getEngineOption = getEngineOption;

// Changes one option, saves it, refreshes the bar and (for text-shaping options) starts a fresh test.
function setEngineOption(name, value, { restart = true } = {}) {
    const clean = sanitizeEngineOption(name, value);
    if (clean === undefined || engineOptions[name] === clean) return false;
    engineOptions[name] = clean;
    saveEngineOptions();
    applyEngineOptionSideEffects(name);
    updateEngineOptionsBar();
    if (restart && ENGINE_TEXT_OPTIONS.includes(name) && typeof newTest === 'function' && currentMode !== 'daily') {
        newTest(true);
    }
    return true;
}
window.setEngineOption = setEngineOption;

function applyEngineOptionSideEffects(name) {
    if (name === 'time') applyTimedDuration();
    if (name === 'caret' || name === 'smoothCaret') updateCaretStyleClasses();
    if (name === 'liveStats' || name === 'liveChart') applyLiveDisplayOptions();
}

function applyLiveDisplayOptions() {
    const area = document.getElementById('typing-area');
    if (!area) return;
    area.classList.toggle('live-stats-off', !engineOptions.liveStats);
    area.classList.toggle('live-chart-off', !engineOptions.liveChart);
    const sw = document.getElementById('live-chart-toggle-btn');
    if (sw) sw.setAttribute('aria-checked', engineOptions.liveChart ? 'true' : 'false');
}

function updateEngineOptionsBar() {
    const bar = document.getElementById('engine-options');
    if (!bar) return;
    const typingMode = getActiveTypingMode();
    const inChallenge = typeof activeChallengeId !== 'undefined' && !!activeChallengeId;
    const wordsLike = typingMode === 'words' || typingMode === 'words30';
    bar.hidden = inChallenge || currentMode === 'daily';
    const timeGroup = document.getElementById('engine-opt-time');
    const wordsGroup = document.getElementById('engine-opt-words');
    const textGroup = document.getElementById('engine-opt-text');
    if (timeGroup) timeGroup.hidden = typingMode !== 'words30';
    if (wordsGroup) wordsGroup.hidden = typingMode !== 'words';
    if (textGroup) textGroup.hidden = !wordsLike;
    bar.querySelectorAll('[data-opt]').forEach((btn) => {
        const name = btn.dataset.opt;
        if (!(name in engineOptions)) return;
        let on;
        if (btn.hasAttribute('data-toggle')) {
            on = engineOptions[name] === true;
            btn.setAttribute('aria-pressed', on ? 'true' : 'false');
        } else {
            on = String(engineOptions[name]) === String(btn.dataset.val);
            btn.setAttribute('aria-pressed', on ? 'true' : 'false');
        }
        btn.classList.toggle('active', on);
    });
    applyLiveDisplayOptions();
}

function initEngineOptionsBar() {
    const bar = document.getElementById('engine-options');
    if (!bar) return;
    // Buttons must not steal focus from the hidden typing input.
    bar.addEventListener('pointerdown', (e) => {
        if (e.target.closest('button')) e.preventDefault();
    });
    bar.addEventListener('click', (e) => {
        const more = e.target.closest('#engine-opt-more');
        if (more) {
            const extra = document.getElementById('engine-opt-extra');
            if (!extra) return;
            const open = extra.hidden;
            extra.hidden = !open;
            more.setAttribute('aria-expanded', open ? 'true' : 'false');
            more.classList.toggle('active', open);
            return;
        }
        const btn = e.target.closest('[data-opt]');
        if (!btn) return;
        const name = btn.dataset.opt;
        if (btn.hasAttribute('data-toggle')) setEngineOption(name, !engineOptions[name]);
        else setEngineOption(name, btn.dataset.val);
        if (!matchMedia('(pointer: coarse)').matches && typeof focusInput === 'function' && currentMode !== 'daily') focusInput();
    });
    updateEngineOptionsBar();
}

// ── Mode ───────────────────────────────────────────────────────────────────
let currentMode = 'words';
let RANDOM_WORDS_DURATION = 30; // timed-mode length; follows engineOptions.time (js/app-results.js reads this)
const RANDOM_WORDS_BUFFER_WORDS = 80;
const NO_BACKSPACE_MIN_ACC = 80;
let activeCommunityBoostMode = null;
let communityModeRuntime = null;
const COMMUNITY_BOOST_MODES = {
    targeted_weakness: {
        id: 'targeted_weakness',
        name: 'Targeted Weakness',
        desc: 'Words containing X or Z deal triple hull damage.',
        mode: 'quotes',
    },
    kinetic_shielding: {
        id: 'kinetic_shielding',
        name: 'Kinetic Shielding',
        desc: 'Maintain WPM above your personal average to dodge 5 glitch-bolts.',
        mode: 'words30',
    },
};

function getActiveTypingMode(mode = currentMode) {
    if (mode !== 'community') return mode;
    const def = getCommunityBoostDefinition();
    return def ? def.mode : 'words';
}

function isTimedMode(mode = currentMode) {
    return getActiveTypingMode(mode) === 'words30';
}

function getModeLabel(mode = currentMode) {
    if (activeChallengeId === 'sprint')       return 'challenge: sprint';
    if (activeChallengeId === 'nobackspace')  return 'challenge: no backspace';
    if (activeChallengeId === 'perfectionist') return 'challenge: perfectionist';
    if (activeChallengeId === 'marathon') return 'challenge: marathon';
    if (activeChallengeId === 'consistent_climber') return 'challenge: consistent climber';
    if (activeChallengeId === 'rival_week') return 'challenge: rival week';
    if (activeChallengeId === 'above_average') return 'challenge: above average';
    if (mode === 'community') {
        const def = getCommunityBoostDefinition();
        return def ? `community: ${def.name.toLowerCase()}` : 'community mode';
    }
    if (mode === 'quotes') return 'quotes';
    if (mode === 'words')  return `words ${engineOptions.words}`;
    if (mode === 'adaptive') return 'weak keys';
    return `timed ${RANDOM_WORDS_DURATION}s`;
}

function getPrimaryNewTestLabel(mode = currentMode) {
    if (mode === 'community') return 'New Mission';
    if (mode !== 'quotes') return 'New Words';
    return bibleModeEnabled ? 'New Verse' : 'New Quote';
}

function updatePrimaryNewTestButtons() {
    const label = getPrimaryNewTestLabel(currentMode);
    document.querySelectorAll('.new-test-btn').forEach((btn) => {
        btn.innerHTML = escapeHtml(label) + '<span class="btn-hint">(Esc)</span>';
    });
}

function normalizeQuoteEntries(entries) {
    if (!Array.isArray(entries)) return [];
    return entries
        .map((entry) => {
            const text = String(entry && entry.text || '').trim();
            if (!text) return null;
            const source = String(entry && entry.source || 'Bible').trim() || 'Bible';
            return { text, source };
        })
        .filter(Boolean);
}

function getBibleQuotePool() {
    return normalizeQuoteEntries(window.BIBLE_VERSES);
}

function getQuotePool() {
    if (!bibleModeEnabled) return QUOTES;
    const biblePool = getBibleQuotePool();
    if (biblePool.length > 0) return biblePool;
    if (!bibleModeMissingWarned) {
        bibleModeMissingWarned = true;
        showUiMessage('Bible mode is enabled but no verses are loaded yet. Using default quotes.', 'info', 3200, 'top-left');
    }
    return QUOTES;
}

function updateBibleModeUi() {
    const stat = document.getElementById('bible-mode-inline');
    const toggle = document.getElementById('bible-mode-toggle');
    if (stat) stat.style.display = currentMode === 'quotes' ? 'flex' : 'none';
    if (toggle) toggle.checked = !!bibleModeEnabled;
    updatePrimaryNewTestButtons();
    updateSectorMapButtonVisibility();
    updateCommunityModePopup();
}

function toggleBibleMode() {
    bibleModeEnabled = !bibleModeEnabled;
    bibleModeMissingWarned = false;
    try { localStorage.setItem(BIBLE_MODE_KEY, bibleModeEnabled ? '1' : '0'); } catch (e) {}
    updateBibleModeUi();
    if (currentMode === 'quotes') newTest(true);
}
window.toggleBibleMode = toggleBibleMode;

function isTouchDevice() {
    return matchMedia('(pointer: coarse)').matches;
}

// The hint line wording. Set once; touch devices never fall back to the desktop wording.
function getDefaultHintText() {
    return isTouchDevice()
        ? 'Tap the text to start'
        : 'Tab: restart · Esc: new text · Backspace: fix';
}

function applyDefaultHint() {
    if (!hintEl) return;
    if (typeof activeChallengeId !== 'undefined' && activeChallengeId) return;
    hintEl.textContent = getDefaultHintText();
}

function setMode(mode) {
    const previousMode = currentMode;
    activeChallengeId = null;
    if (mode !== 'community' && currentMode === 'community') {
        activeCommunityBoostMode = null;
        communityModeRuntime = null;
    }
    currentMode = mode;
    document.querySelectorAll('.mode-tab').forEach(btn =>
        btn.classList.toggle('active', btn.dataset.mode === mode));
    updateTypingViewportMode(true);
    updateSectorMapButtonVisibility();
    updateBibleModeUi();
    updateEngineOptionsBar();
    const panel = document.getElementById('challenge-panel');
    const area  = document.getElementById('typing-area');
    if (mode === 'daily') {
        finalizePendingResult();
        stopTimer();
        startTime = null;
        isComplete = false;
        resultsPendingOpen = false;
        hideFocusLostOverlay();
        if (sfxReady && previousMode !== 'daily') playSound(SFX.changeMode);
        if (panel) panel.style.display = 'block';
        if (area)  area.style.display  = 'none';
        clearMiningLaserOverlay();
        renderDailyChallenges();
    } else {
        if (panel) panel.style.display = 'none';
        if (area)  area.style.display  = '';
        updateChallengeHint();
        applyDefaultHint();
        newTest(true);
    }
}

function generateTargetedWeaknessPassage(count = 60) {
    const xzWords = WORD_LIST.filter((w) => /[xz]/i.test(w));
    const pool = xzWords.length > 0 ? xzWords : ['xenon', 'zodiac', 'matrix', 'horizon', 'zenith'];
    const words = [];
    for (let i = 0; i < count; i++) {
        if (i % 6 === 0) words.push(pool[Math.floor(testRng() * pool.length)]);
        else words.push(generateWord());
    }
    return words.join(' ');
}

function getCommunityBoostDefinition(modeId = activeCommunityBoostMode) {
    if (!modeId) return null;
    return COMMUNITY_BOOST_MODES[modeId] || null;
}

function isCommunityBoostActiveForCurrentMode(mode = currentMode) {
    const def = getCommunityBoostDefinition();
    return !!(def && mode === 'community');
}

function buildCommunityModeRuntime() {
    if (!isCommunityBoostActiveForCurrentMode()) return null;
    if (activeCommunityBoostMode === 'kinetic_shielding') {
        const rawBaseline = Number(getAverageWpmBaseline()) || 0;
        return {
            baselineWpm: Math.max(20, Math.round(rawBaseline || 35)),
            shieldBroken: false,
            dodges: 0,
            maxDodges: 5,
            graceSeconds: 2,
            damageMultiplier: 1,
        };
    }
    if (activeCommunityBoostMode === 'targeted_weakness') {
        return { xzBonusWords: 0 };
    }
    return null;
}

function startCommunityBoostMode(modeId) {
    const def = COMMUNITY_BOOST_MODES[modeId];
    if (!def) return;
    activeCommunityBoostMode = modeId;
    communityModeRuntime = null;
    closeCommunityHub();
    setMode('community');
    showUiMessage(`${def.name} engaged. Fleet damage boost active.`, 'success', 2600, 'top-left');
}
window.startCommunityBoostMode = startCommunityBoostMode;

function clearCommunityBoostMode() {
    if (!activeCommunityBoostMode) return;
    activeCommunityBoostMode = null;
    communityModeRuntime = null;
    if (currentMode === 'community') setMode('words');
    renderCommunityHub();
    showUiMessage('Community boost mode disabled.', 'info', 2200, 'top-left');
}
window.clearCommunityBoostMode = clearCommunityBoostMode;

function exitCommunityBoostMode() {
    clearCommunityBoostMode();
}
window.exitCommunityBoostMode = exitCommunityBoostMode;

function updateCommunityModePopup() {
    const popup = document.getElementById('community-mode-popup');
    const title = document.getElementById('community-mode-popup-title');
    const desc = document.getElementById('community-mode-popup-desc');
    const status = document.getElementById('community-mode-popup-status');
    if (!popup || !title || !desc || !status) return;
    const def = getCommunityBoostDefinition();
    const show = currentMode === 'community' && !!def;
    popup.classList.toggle('show', show);
    if (!show) return;
    title.textContent = `Community Mode: ${def.name}`;
    desc.textContent = def.desc;
    if (def.id === 'kinetic_shielding') {
        const runtime = communityModeRuntime || {};
        const dodges = Math.max(0, Math.min(5, Number(runtime.dodges) || 0));
        const baseline = Math.round(Number(runtime.baselineWpm) || 0);
        status.textContent = `Dodges: ${dodges}/5 · Hold above ${baseline} WPM`;
        return;
    }
    if (def.id === 'targeted_weakness') {
        const bonus = Number(communityModeRuntime && communityModeRuntime.xzBonusWords) || 0;
        status.textContent = `X/Z bonus words hit: ${bonus}`;
        return;
    }
    status.textContent = '';
}

function normalizeDamageToken(token) {
    return String(token || '')
        .toLowerCase()
        .replace(/^[^a-z0-9']+|[^a-z0-9']+$/g, '');
}

function computeCommunityDamage(typedWords, typedAttempt, quoteText) {
    let damage = Math.max(0, Math.floor(Number(typedWords) || 0));
    const modeDef = getCommunityBoostDefinition();
    if (!modeDef || currentMode !== 'community') return damage;
    if (modeDef.id === 'targeted_weakness') {
        const typedTokens = String(typedAttempt || '').split(/\s+/).filter(Boolean).map(normalizeDamageToken);
        const quoteTokens = String(quoteText || '').split(/\s+/).filter(Boolean).map(normalizeDamageToken);
        const compareCount = Math.min(typedTokens.length, quoteTokens.length);
        let matchedTargetWords = 0;
        for (let i = 0; i < compareCount; i++) {
            if (!/[xz]/i.test(quoteTokens[i])) continue;
            if (typedTokens[i] && typedTokens[i] === quoteTokens[i]) matchedTargetWords++;
        }
        damage += matchedTargetWords * 2; // triple total damage for each matched X/Z word
        if (communityModeRuntime) communityModeRuntime.xzBonusWords = matchedTargetWords;
        return damage;
    }
    if (modeDef.id === 'kinetic_shielding') {
        const dodges = Math.max(0, Math.min(5, Number(communityModeRuntime && communityModeRuntime.dodges) || 0));
        const multiplier = 1 + dodges * 0.2;
        if (communityModeRuntime) communityModeRuntime.damageMultiplier = multiplier;
        damage = Math.round(damage * multiplier);
        return damage;
    }
    return damage;
}

let sfxReady = false; // suppresses sound on the initial boot call
let pendingTestSpec = null; // { seed, options } handed to the next newTest()

// ── Ghost (pace marker) storage, keyed by the exact text ───────────────────
const GHOST_STORE_KEY = 'sampire-ghosts-v2';
const GHOST_STORE_MAX = 30;
function ghostStoreKey(mode, text) {
    // Short stable hash of mode + text (djb2) so keys stay small.
    const s = `${mode}::${text}`;
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return `${mode}:${(h >>> 0).toString(36)}:${text.length}`;
}
function loadGhostStore() {
    try {
        const parsed = JSON.parse(localStorage.getItem(GHOST_STORE_KEY) || 'null');
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch (e) { return {}; }
}
function saveGhostForText(mode, text, timeline, wpm) {
    if (!Array.isArray(timeline) || timeline.length < 2) return;
    const store = loadGhostStore();
    const key = ghostStoreKey(mode, text);
    const existing = store[key];
    if (existing && existing.text === text && Number(existing.wpm) > wpm) {
        existing.savedAt = Date.now(); // keep the faster ghost, but mark it recent
    } else {
        store[key] = { text, wpm, timeline: timeline.map(p => ({ t: p.t, index: p.index })), savedAt: Date.now() };
    }
    const keys = Object.keys(store).sort((a, b) => (store[b].savedAt || 0) - (store[a].savedAt || 0));
    for (const k of keys.slice(GHOST_STORE_MAX)) delete store[k];
    try { localStorage.setItem(GHOST_STORE_KEY, JSON.stringify(store)); } catch (e) {}
}
function loadGhostForText(mode, text) {
    const store = loadGhostStore();
    const entry = store[ghostStoreKey(mode, text)];
    if (entry && entry.text === text && Array.isArray(entry.timeline)) return entry.timeline;
    if (mode === 'quotes') {
        // Older per-quote key written by showResults (also keyed by the text).
        try {
            const stored = localStorage.getItem('sampire-ghost-quotes-' + btoa(encodeURIComponent(text)).slice(0, 40));
            if (stored) return JSON.parse(stored);
        } catch (e) {}
    }
    return null;
}

// newTest(true) = called from a mode switch; newTest({ seed, mode, options }) = reproduce a shared test.
function newTest(arg = false) {
    let fromModeSwitch = arg === true;
    let spec = null;
    if (arg && typeof arg === 'object') spec = arg;
    if (!spec && pendingTestSpec) { spec = pendingTestSpec; pendingTestSpec = null; fromModeSwitch = true; }
    if (spec && spec.mode && spec.mode !== currentMode) {
        pendingTestSpec = { seed: spec.seed, options: spec.options };
        setMode(spec.mode);
        return;
    }
    if (spec && spec.options && typeof spec.options === 'object') {
        for (const name of Object.keys(spec.options)) setEngineOption(name, spec.options[name], { restart: false });
    }
    finalizePendingResult();
    if (sfxReady) playSound(fromModeSwitch ? SFX.changeMode : SFX.newTest);
    resetWordGenerator(spec && spec.seed != null ? spec.seed : makeRandomSeed());
    pendingGhostChars = null;
    pendingGhostTimeline = null;
    communityModeRuntime = buildCommunityModeRuntime();
    if (activeChallengeId === 'sprint') {
        init(generateWordTest(120), 'Challenge: The Sprint • 30s • 100 WPM');
    } else if (activeChallengeId === 'nobackspace') {
        init(generateWordTest(100, { final: true }), `Challenge: No Backspace • 100 words • ${NO_BACKSPACE_MIN_ACC}% accuracy`);
    } else if (activeChallengeId === 'perfectionist') {
        const short = QUOTES.filter(q => q.text.trim().split(/\s+/).length >= 20 && q.text.trim().split(/\s+/).length <= 30);
        const pool = short.length > 0 ? short : QUOTES;
        const q = pool[Math.floor(testRng() * pool.length)];
        init(q.text, `Challenge: The Perfectionist • ${q.source}`);
    } else if (currentMode === 'community') {
        const def = getCommunityBoostDefinition();
        if (!def) {
            init(generateWordTest(engineOptions.words, { final: true }), '');
        } else if (def.id === 'targeted_weakness') {
            init(generateTargetedWeaknessPassage(65), 'Community Mode • Targeted Weakness');
        } else if (def.id === 'kinetic_shielding') {
            const baseline = Number(communityModeRuntime && communityModeRuntime.baselineWpm) || 35;
            init(generateWordTest(120), `Community Mode • Kinetic Shielding • Hold above ${baseline} WPM`);
        } else {
            init(generateWordTest(engineOptions.words, { final: true }), '');
        }
    } else if (currentMode === 'quotes') {
        const useTargetedPassage = activeCommunityBoostMode === 'targeted_weakness';
        const pool = getQuotePool();
        const q = pool[currentTestSeed % pool.length];
        if (useTargetedPassage) {
            init(generateTargetedWeaknessPassage(65), 'Community Mode: Targeted Weakness');
        } else {
            pendingGhostTimeline = loadGhostForText('quotes', q.text);
            init(q.text, q.source);
        }
    } else if (currentMode === 'adaptive') {
        const drill = window.AdaptivePractice
            ? AdaptivePractice.generateDrill({ wordCount: 40, wordPool: WORD_LIST })
            : '';
        let statusLine = '';
        if (window.AdaptivePractice && typeof AdaptivePractice.getStatusLine === 'function') {
            statusLine = String(AdaptivePractice.getStatusLine() || '');
        } else {
            const weak = window.AdaptivePractice ? AdaptivePractice.getWeakKeys(3) : [];
            statusLine = weak.length
                ? 'Weak-key drill: ' + weak.map(w => (w && (w.char || w.key)) || w).join(', ')
                : 'Type a few runs first so we can find your weak keys';
        }
        init(drill || generateWordTest(40, { final: true }), statusLine);
    } else if (currentMode === 'words30') {
        if (activeCommunityBoostMode === 'kinetic_shielding') {
            const baseline = Number(communityModeRuntime && communityModeRuntime.baselineWpm) || 35;
            init(generateWordTest(120), `Community Mode: Kinetic Shielding • Hold above ${baseline} WPM`);
        } else {
            const text = generateWordTest(120);
            pendingGhostTimeline = loadGhostForText('words30', text);
            init(text, `Timed • ${RANDOM_WORDS_DURATION}s`);
        }
    } else {
        const text = generateWordTest(engineOptions.words, { final: true });
        pendingGhostTimeline = loadGhostForText('words', text);
        init(text, '');
    }
    updateCommunityModePopup();
}

// ── State ──────────────────────────────────────────────────────────────────
let currentQuote       = '';
let currentQuoteSource = '';
let typedChars         = [];   // one entry per quote position; '' marks a letter skipped by Space
let currentIndex  = 0;
let startTime     = null;      // performance.now() when the first key was typed
let timerHandle   = null;
let isComplete    = false;
let resultsPendingOpen = false;
let pendingResultElapsed = null; // elapsed captured when the run finished, until showResults runs
let wpmSamples    = [];   // [{t, wpm, raw, burst, rawBurst}, ...] one per second
let lastSampleSec = -1;
let lastSampleCorrect = 0;
let lastSampleKeys = 0;
let keyStrokes    = 0;
let backspaces    = 0;
let mistakeCount  = 0;
let extraChars    = [];   // per word index: string of letters typed past the word's end
let extraSpans    = [];   // per word index: the <span class="char-extra"> elements
let wordErrorFlags = [];  // per word index: true once the word was left with an error in it
let ghostChars    = [];
let pendingGhostChars = null;
const lastAttemptByTest = new Map();
let lastCompletedTestKey = '';
let lastCompletedAttempt = [];
let attemptTimeline = [];
let ghostTimeline = [];
let pendingGhostTimeline = null;
const lastTimelineByTest = new Map();
let lastCompletedTimeline = [];
let ghostReplayIndex = -1;
let charSpans = []; // flat array of char <span> elements, indexed by quote position
let wordSpans = [];
let wordRanges = [];
let charWordIndex = []; // quote position -> word index (-1 for spaces)
let activeAuraWordIndex = -1;
const MAX_EXTRA_CHARS_PER_WORD = 20;

function getTestKey(mode = currentMode, text = currentQuote) {
    return `${mode}::${text}`;
}

function getGhostIndexAtElapsed(elapsed) {
    if (!Array.isArray(ghostTimeline) || ghostTimeline.length === 0) return -1;
    if (elapsed <= ghostTimeline[0].t) return ghostTimeline[0].index;
    for (let i = 1; i < ghostTimeline.length; i++) {
        const prev = ghostTimeline[i - 1];
        const next = ghostTimeline[i];
        if (elapsed <= next.t) {
            const span = next.t - prev.t;
            if (span <= 0) return next.index;
            const frac = (elapsed - prev.t) / span;
            return Math.round(prev.index + frac * (next.index - prev.index));
        }
    }
    return ghostTimeline[ghostTimeline.length - 1].index;
}

function loadGhostCursorPreference() {
    try {
        const stored = localStorage.getItem(GHOST_CURSOR_ENABLED_KEY);
        if (stored === '0') ghostCursorEnabled = false;
        else if (stored === '1') ghostCursorEnabled = true;
    } catch (e) {}
}

function loadMiningVisualsPreference() {
    try {
        const stored = localStorage.getItem(MINING_VISUALS_ENABLED_KEY);
        if (stored === '0') miningVisualsEnabled = false;
        else if (stored === '1') miningVisualsEnabled = true;
    } catch (e) {}
}

function loadMiningLaserSoundPreference() {
    try {
        const stored = localStorage.getItem(MINING_LASER_SOUND_ENABLED_KEY);
        if (stored === '0') miningLaserSoundEnabled = false;
        else if (stored === '1') miningLaserSoundEnabled = true;
    } catch (e) {}
}

// Works whether the button is a plain labelled button or a CSS-drawn switch (role="switch").
function syncToggleButton(btn, on, label) {
    if (!btn) return;
    const isSwitch = btn.classList.contains('switch') || btn.getAttribute('role') === 'switch';
    if (isSwitch) {
        btn.setAttribute('aria-checked', on ? 'true' : 'false');
        if (!btn.classList.contains('mining-sfx-icon-toggle')) btn.textContent = '';
    } else {
        btn.textContent = `${label}: ${on ? 'On' : 'Off'}`;
        btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
    btn.classList.toggle('toggle-on', on);
}

function updateGhostToggleButton() {
    syncToggleButton(document.getElementById('ghost-toggle-btn'), ghostCursorEnabled, 'Pace marker');
}

function updateMiningLaserSoundToggleButton() {
    const btn = document.getElementById('mining-fx-sfx-toggle-btn');
    const lyraBtn = document.getElementById('lyra-story-sfx-toggle');
    if (btn) {
        btn.textContent = miningLaserSoundEnabled ? '🔊' : '🔇';
        btn.classList.toggle('on', miningLaserSoundEnabled);
        btn.classList.toggle('muted', !miningLaserSoundEnabled);
        btn.setAttribute('aria-label', miningLaserSoundEnabled ? 'Mute laser sounds' : 'Enable laser sounds');
        btn.setAttribute('aria-checked', miningLaserSoundEnabled ? 'true' : 'false');
        btn.title = miningLaserSoundEnabled ? 'Mute laser sounds' : 'Enable laser sounds';
        btn.style.display = miningVisualsEnabled ? 'inline-flex' : 'none';
        const row = document.getElementById('laser-sound-row');
        if (row) row.hidden = !miningVisualsEnabled;
    }
    if (lyraBtn) {
        lyraBtn.textContent = miningLaserSoundEnabled ? '🔊' : '🔇';
        lyraBtn.classList.toggle('muted', !miningLaserSoundEnabled);
        lyraBtn.setAttribute('aria-label', miningLaserSoundEnabled ? 'Mute mining sound effects' : 'Enable mining sound effects');
        lyraBtn.title = miningLaserSoundEnabled ? 'Mute mining sound effects' : 'Enable mining sound effects';
    }
}

function updateMiningFxToggleButton() {
    syncToggleButton(document.getElementById('mining-fx-toggle-btn'), miningVisualsEnabled, 'Effects');
    updateMiningLaserSoundToggleButton();
}

function toggleGhostCursor() {
    ghostCursorEnabled = !ghostCursorEnabled;
    try { localStorage.setItem(GHOST_CURSOR_ENABLED_KEY, ghostCursorEnabled ? '1' : '0'); } catch (e) {}
    if (!ghostCursorEnabled) {
        ghostReplayIndex = -1;
    } else if (Array.isArray(ghostTimeline) && ghostTimeline.length > 0) {
        const elapsed = startTime ? getElapsed() : 0;
        ghostReplayIndex = Math.max(0, Math.min(currentQuote.length - 1, getGhostIndexAtElapsed(elapsed)));
    }
    updateGhostToggleButton();
    renderQuote();
}
window.toggleGhostCursor = toggleGhostCursor;

function toggleMiningVisuals() {
    miningVisualsEnabled = !miningVisualsEnabled;
    try { localStorage.setItem(MINING_VISUALS_ENABLED_KEY, miningVisualsEnabled ? '1' : '0'); } catch (e) {}
    updateMiningFxToggleButton();
    if (!miningVisualsEnabled) {
        clearMiningLaserOverlay();
    } else {
        updateMiningLaserAtActiveWord();
    }
}
window.toggleMiningVisuals = toggleMiningVisuals;

function toggleMiningLaserSound() {
    miningLaserSoundEnabled = !miningLaserSoundEnabled;
    try { localStorage.setItem(MINING_LASER_SOUND_ENABLED_KEY, miningLaserSoundEnabled ? '1' : '0'); } catch (e) {}
    updateMiningLaserSoundToggleButton();
}
window.toggleMiningLaserSound = toggleMiningLaserSound;

function recordAttemptTimelinePoint() {
    if (!startTime) return;
    const t = getElapsed();
    const point = { t, index: currentIndex };
    const last = attemptTimeline[attemptTimeline.length - 1];
    if (!last || last.index !== point.index || (point.t - last.t) > 0.08) {
        attemptTimeline.push(point);
    }
}

// ── DOM refs ───────────────────────────────────────────────────────────────
const quoteDisplay      = document.getElementById('quote-display');
const hiddenInput       = document.getElementById('hidden-input');
// Zero-width sentinel kept in the hidden input so soft-keyboard Backspace has something to delete
const HIDDEN_INPUT_SENTINEL = '​';
let keydownHandledInput = false; // set when keydown already consumed a printable key
function resetHiddenInput() {
    hiddenInput.value = HIDDEN_INPUT_SENTINEL;
    try { hiddenInput.setSelectionRange(HIDDEN_INPUT_SENTINEL.length, HIDDEN_INPUT_SENTINEL.length); } catch (e) {}
}
const TYPED_CHAR_MAP = {
    '‘': "'", '’': "'", '‚': "'", '‛': "'",
    '“': '"', '”': '"', '„': '"', '‟': '"',
    '–': '-', '—': '-', '−': '-',
    '…': '.', ' ': ' ', ' ': ' ', ' ': ' ',
};
// Single char in, single char out (an ellipsis is treated as '.')
function normalizeTypedChar(ch) {
    const c = String(ch == null ? '' : ch);
    return Object.prototype.hasOwnProperty.call(TYPED_CHAR_MAP, c) ? TYPED_CHAR_MAP[c] : c;
}
function stripCharAccents(ch) {
    return ch.normalize('NFD').replace(/[̀-ͯ]/g, '');
}
// True if the typed char satisfies the target char. An accented target also accepts its base letter.
function typedCharMatches(typed, target) {
    const t = normalizeTypedChar(typed);
    const g = normalizeTypedChar(target);
    if (t === g) return true;
    const base = stripCharAccents(g);
    return base !== g && stripCharAccents(t) === base;
}
function isImeKeydown(e) {
    return !!(e.isComposing || e.keyCode === 229 || e.key === 'Process' || e.key === 'Dead' || e.key === 'Unidentified');
}
// Printable key, including AltGr (reported as ctrl+alt on Windows)
function isPrintableKeyEvent(e) {
    if (!e.key || e.key.length !== 1 || e.metaKey) return false;
    if (!e.ctrlKey && !e.altKey) return true;
    return (e.ctrlKey && e.altKey) || !!(e.getModifierState && e.getModifierState('AltGraph'));
}
const lyraQuoteDisplay  = document.getElementById('lyra-quote-display');
const wpmEl             = document.getElementById('wpm');
const accuracyEl        = document.getElementById('accuracy');
const timerEl           = document.getElementById('timer');
const timerLabelEl      = document.getElementById('timer-label');
const progressEl        = document.getElementById('progress');
const hintEl            = document.getElementById('hint');
const resultOverlay     = document.getElementById('result-overlay');
const chartCanvas       = document.getElementById('wpm-chart');
const chartCanvasResult = document.getElementById('wpm-chart-result');
const miningLaserOverlay = document.getElementById('mining-laser-overlay');
const miningLaserShip = document.getElementById('mining-laser-ship');
const capsLockBadgeEl = document.getElementById('capslock-badge');

// Overlay elements that live inside the quote display (re-attached after every render)
const caretEl = document.createElement('span');
caretEl.id = 'typing-caret';
caretEl.className = 'typing-caret';
caretEl.setAttribute('aria-hidden', 'true');
const paceMarkerEl = document.createElement('span');
paceMarkerEl.id = 'pace-marker';
paceMarkerEl.className = 'pace-marker';
paceMarkerEl.setAttribute('aria-hidden', 'true');
const focusLostEl = document.createElement('div');
focusLostEl.id = 'focus-lost-overlay';
focusLostEl.className = 'focus-lost-overlay';
focusLostEl.setAttribute('role', 'status');
focusLostEl.textContent = 'Click or press any key to continue';
let focusLostTimer = null;
let caretBlinkTimer = null;

// Is a dialog (not the Lyra Gate, which has its own typing) open on top of the test?
function isBlockingModalOpen() {
    if (!activeModalEl || !activeModalEl.classList.contains('show')) return false;
    // The Lyra Gate has its own typing, and the results screen has its own Space/Tab/Esc handling.
    return activeModalEl.id !== 'lyra-gate-modal' && activeModalEl.id !== 'result-overlay';
}

// ── Core logic ─────────────────────────────────────────────────────────────
function clearChart(canvas) {
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function drawIdleLiveChart() {
    // Render a static baseline so the live graph is visible before typing starts.
    if (!engineOptions.liveChart) return;
    drawLineChart(chartCanvas, [{ t: 0, wpm: 0 }, { t: 5, wpm: 0 }]);
}

function stopTimer() {
    if (timerHandle) clearInterval(timerHandle);
    timerHandle = null;
}

// If a run finished but its results are still waiting on the short delay, record it now.
function finalizePendingResult() {
    if (!resultsPendingOpen) return false;
    const elapsed = pendingResultElapsed;
    resultsPendingOpen = false;
    pendingResultElapsed = null;
    if (typeof showResults === 'function') showResults(elapsed != null ? elapsed : undefined);
    return true;
}

// Marks the run finished and books the results screen after a short delay.
function completeRun(delayMs) {
    if (isComplete) return;
    isComplete = true;
    const elapsed = getElapsed();
    finalizeSamples(elapsed);
    stopTimer();
    hideFocusLostOverlay();
    resultsPendingOpen = true;
    pendingResultElapsed = elapsed;
    rememberGhostForRun(elapsed);
    setTimeout(() => { if (resultsPendingOpen) finalizePendingResult(); }, delayMs);
}

function rememberGhostForRun(elapsed) {
    if (activeChallengeId || currentMode === 'community') return;
    const mode = currentMode;
    if (mode !== 'words' && mode !== 'words30' && mode !== 'quotes') return;
    const timeline = attemptTimeline.length > 1 ? attemptTimeline : [{ t: 0, index: 0 }, { t: Math.max(elapsed, 0.1), index: currentIndex }];
    saveGhostForText(mode, currentQuote, timeline, getWPM(elapsed));
}

function init(quote, source = '') {
    finalizePendingResult();
    currentQuote       = quote;
    currentQuoteSource = source;
    typedChars   = [];
    extraChars   = [];
    wordErrorFlags = [];
    currentIndex = 0;
    startTime    = null;
    isComplete   = false;
    resultsPendingOpen = false;
    pendingResultElapsed = null;
    ghostChars   = Array.isArray(pendingGhostChars) ? pendingGhostChars.slice() : [];
    ghostTimeline = Array.isArray(pendingGhostTimeline) ? pendingGhostTimeline.slice() : [];
    adaptiveLastKeyAt = 0;
    if (window.RunAnalysis) RunAnalysis.ghostDelta.reset();
    ghostReplayIndex = (ghostCursorEnabled && ghostTimeline.length > 0) ? ghostTimeline[0].index : -1;
    attemptTimeline = [];
    pendingGhostChars = null;
    pendingGhostTimeline = null;

    stopTimer();
    hideFocusLostOverlay();

    wpmEl.textContent      = '0';
    accuracyEl.textContent = '—';
    timerEl.textContent    = isTimedMode() ? `${RANDOM_WORDS_DURATION}s` : '0s';
    if (timerLabelEl) timerLabelEl.textContent = isTimedMode() ? 'Time left' : 'Time';
    progressEl.style.width = '0%';

    wpmSamples    = [];
    lastSampleSec = -1;
    lastSampleCorrect = 0;
    lastSampleKeys = 0;
    keyStrokes    = 0;
    backspaces    = 0;
    mistakeCount  = 0;
    clearChart(chartCanvas);
    clearChart(chartCanvasResult);
    requestAnimationFrame(drawIdleLiveChart);
    chartCanvasResult.style.display = 'none';

    resultOverlay.classList.remove('show');
    hintEl.classList.add('visible');
    applyDefaultHint();

    // Update source attribution line
    const sourceEl = document.getElementById('quote-source');
    if (sourceEl) sourceEl.textContent = source;

    updateTypingViewportMode(true);
    renderQuote();
    focusInput();
}

function loadGhostForRestart() {
    const key = getTestKey();
    const savedAttempt = lastAttemptByTest.get(key);
    const savedTimeline = lastTimelineByTest.get(key);
    if (isComplete && lastCompletedTestKey === key && Array.isArray(lastCompletedAttempt) && lastCompletedAttempt.length > 0) {
        pendingGhostChars = lastCompletedAttempt.slice();
        pendingGhostTimeline = Array.isArray(lastCompletedTimeline) ? lastCompletedTimeline.slice() : [];
    } else {
        pendingGhostChars = Array.isArray(savedAttempt) ? savedAttempt.slice() : typedChars.slice();
        pendingGhostTimeline = Array.isArray(savedTimeline) ? savedTimeline.slice() : [];
    }
}

function restart() {
    finalizePendingResult();
    playSound(SFX.restartTest);
    loadGhostForRestart();
    init(currentQuote, currentQuoteSource);
}

function tryAgain() {
    finalizePendingResult();
    playSound(SFX.tryAgain);
    loadGhostForRestart();
    init(currentQuote, currentQuoteSource);
}

// Timed mode: keep a buffer of words ahead of the cursor; new spans are appended, never rebuilt.
function extendWordBuffer() {
    if (!isTimedMode()) return;
    if (currentQuote.length - currentIndex > 40) return;
    const from = currentQuote.length;
    currentQuote += ' ' + generateWordTest(RANDOM_WORDS_BUFFER_WORDS);
    engineFrame.appendFrom = engineFrame.appendFrom == null ? from : Math.min(engineFrame.appendFrom, from);
    scheduleEngineFrame();
}

function focusInput() {
    resetHiddenInput();
    try {
        hiddenInput.focus({ preventScroll: true });
    } catch (e) {
        hiddenInput.focus();
    }
    quoteDisplay.classList.add('focused');
    // On touch devices the on-screen keyboard path in app-input.js scrolls the
    // text into view once the keyboard is really open (body.vk-open). Scrolling
    // here unconditionally pushed the logo and tabs under the fixed top bar.
}

function shouldUseCompactTypingViewport() {
    return isTimedMode();
}

function updateTypingViewportMode(resetScroll = false) {
    if (!quoteDisplay) return;
    const compact = shouldUseCompactTypingViewport();
    quoteDisplay.classList.toggle('words30-compact', compact);
    syncTypingViewportScroll(resetScroll);
}

// Scroll position for the single-line timed view. Reads happen inside the frame batch; this
// direct version is kept for callers outside the key path (mode switch, resize).
function syncTypingViewportScroll(resetScroll = false) {
    if (!quoteDisplay) return;
    if (!quoteDisplay.classList.contains('words30-compact')) {
        if (resetScroll) quoteDisplay.scrollLeft = 0;
        return;
    }
    if (resetScroll) { quoteDisplay.scrollLeft = 0; return; }
    engineFrame.scroll = true;
    scheduleEngineFrame();
}

window.addEventListener('resize', () => {
    engineFrame.caret = true;
    engineFrame.pace = true;
    engineFrame.scroll = true;
    engineFrame.laser = true;
    scheduleEngineFrame();
    // app-lyra.js loads after this file; a resize can fire before it does (seen on mobile emulation).
    if (typeof isLyraGateOpen === 'function' && isLyraGateOpen()) updateLyraShipAim();
});
if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => { engineFrame.caret = true; engineFrame.pace = true; scheduleEngineFrame(); }).catch(() => {});
}

// ── Focus lost / Caps Lock feedback ────────────────────────────────────────
function showFocusLostOverlay() {
    if (focusLostTimer) { clearTimeout(focusLostTimer); focusLostTimer = null; }
    if (!startTime || isComplete) return;
    focusLostEl.textContent = isTouchDevice() ? 'Tap the text to continue' : 'Click or press any key to continue';
    quoteDisplay.classList.add('focus-lost');
}
function scheduleFocusLostOverlay() {
    if (focusLostTimer) clearTimeout(focusLostTimer);
    focusLostTimer = setTimeout(() => { focusLostTimer = null; showFocusLostOverlay(); }, 160);
}
function hideFocusLostOverlay() {
    if (focusLostTimer) { clearTimeout(focusLostTimer); focusLostTimer = null; }
    quoteDisplay.classList.remove('focus-lost');
}
let capsLockOn = false;
function updateCapsLockBadge(e) {
    if (!e || typeof e.getModifierState !== 'function') return;
    let on = false;
    try { on = !!e.getModifierState('CapsLock'); } catch (err) { on = false; }
    if (on === capsLockOn) return;
    capsLockOn = on;
    if (capsLockBadgeEl) capsLockBadgeEl.hidden = !on;
}

// ── Rendering ──────────────────────────────────────────────────────────────
function charSpanClass(i) {
    const ch = currentQuote[i];
    if (i < currentIndex) {
        const t = typedChars[i];
        if (t === ch) return 'char-correct';
        return t === '' ? 'char-incorrect char-missed' : 'char-incorrect';
    }
    if (i === currentIndex) return 'char-cursor';
    let cls = 'char-untyped';
    if (ghostCursorEnabled && ghostChars[i] !== undefined) {
        cls += ghostChars[i] === ch ? ' char-ghost-correct' : ' char-ghost-incorrect';
    }
    if (ghostCursorEnabled && i === ghostReplayIndex && i !== currentIndex) cls += ' char-ghost-cursor';
    return cls;
}

function makeCharSpan(i) {
    const ch   = currentQuote[i];
    const span = document.createElement('span');
    span.textContent = ch === ' ' ? ' ' : ch;
    span.className = charSpanClass(i);
    return span;
}

// Builds spans for currentQuote[from..] and appends them (used by renderQuote and the timed buffer).
function appendQuoteSpans(from) {
    let i = from;
    const frag = document.createDocumentFragment();
    while (i < currentQuote.length) {
        if (currentQuote[i] === ' ') {
            const sp = makeCharSpan(i);
            charSpans.push(sp);
            charWordIndex.push(-1);
            frag.appendChild(sp);
            i++;
        } else {
            const wordSpan = document.createElement('span');
            wordSpan.className = 'quote-word';
            wordSpan.style.whiteSpace = 'nowrap';
            const wordIdx = wordRanges.length;
            const start = i;
            while (i < currentQuote.length && currentQuote[i] !== ' ') {
                const sp = makeCharSpan(i);
                charSpans.push(sp);
                charWordIndex.push(wordIdx);
                wordSpan.appendChild(sp);
                i++;
            }
            wordRanges.push({ start, end: i });
            wordSpans.push(wordSpan);
            if (wordErrorFlags[wordIdx]) wordSpan.classList.add('word-error');
            frag.appendChild(wordSpan);
        }
    }
    quoteDisplay.insertBefore(frag, caretEl.parentNode === quoteDisplay ? caretEl : null);
}

function attachQuoteOverlays() {
    // Re-append the mobile tap hint (cleared by innerHTML = '') and the engine overlays
    const tapHint = document.getElementById('mobile-tap-hint') || (() => {
        const d = document.createElement('div');
        d.className = 'mobile-tap-hint';
        d.id = 'mobile-tap-hint';
        d.textContent = 'Tap here to start typing';
        return d;
    })();
    quoteDisplay.appendChild(tapHint);
    quoteDisplay.appendChild(paceMarkerEl);
    quoteDisplay.appendChild(caretEl);
    quoteDisplay.appendChild(focusLostEl);
}

function renderQuote() {
    charSpans = [];
    wordSpans = [];
    wordRanges = [];
    charWordIndex = [];
    extraSpans = [];
    activeAuraWordIndex = -1;
    quoteDisplay.innerHTML = '';
    appendQuoteSpans(0);
    for (let w = 0; w < extraChars.length; w++) if (extraChars[w]) syncWordExtras(w);
    attachQuoteOverlays();
    updateCaretStyleClasses();
    engineFrame.spans.clear();
    engineFrame.words.clear();
    engineFrame.appendFrom = null;
    engineFrame.caret = true;
    engineFrame.pace = true;
    engineFrame.scroll = true;
    engineFrame.aura = true;
    engineFrame.laser = true;
    scheduleEngineFrame();
}

// Update a single character span in-place — avoids full DOM rebuild per keystroke.
function updateCharSpan(i) {
    if (i < 0 || i >= charSpans.length) return;
    const span = charSpans[i];
    const cls = charSpanClass(i);
    if (span.className !== cls) span.className = cls;
}

// Makes the extra-letter spans of a word match extraChars[w].
function syncWordExtras(w) {
    const wordEl = wordSpans[w];
    if (!wordEl) return;
    const want = extraChars[w] || '';
    const spans = extraSpans[w] || (extraSpans[w] = []);
    while (spans.length > want.length) spans.pop().remove();
    for (let i = 0; i < spans.length; i++) {
        if (spans[i].textContent !== want[i]) spans[i].textContent = want[i];
    }
    while (spans.length < want.length) {
        const sp = document.createElement('span');
        sp.className = 'char-extra';
        sp.textContent = want[spans.length];
        wordEl.appendChild(sp);
        spans.push(sp);
    }
    wordEl.classList.toggle('word-error', !!wordErrorFlags[w]);
}

function getCurrentWordIndex() {
    if (!wordRanges.length) return -1;
    if (!currentQuote.length) return -1;
    if (currentIndex >= currentQuote.length) return -1;
    let idx = Math.max(0, Math.min(currentQuote.length - 1, currentIndex));
    if (currentQuote[idx] === ' ') {
        let next = idx + 1;
        while (next < currentQuote.length && currentQuote[next] === ' ') next++;
        if (next < currentQuote.length) {
            idx = next;
        } else {
            let prev = idx - 1;
            while (prev >= 0 && currentQuote[prev] === ' ') prev--;
            if (prev < 0) return -1;
            idx = prev;
        }
    }
    return getWordIndexForChar(idx);
}

function getWordIndexForChar(charIndex) {
    if (!wordRanges.length) return -1;
    const idx = Math.max(0, Math.min(currentQuote.length - 1, Number(charIndex) || 0));
    if (idx < charWordIndex.length) return charWordIndex[idx];
    // Positions past the rendered spans (timed buffer not yet appended): scan the text
    let w = wordRanges.length - 1;
    let i = charWordIndex.length;
    let inWord = i > 0 && currentQuote[i - 1] !== ' ';
    for (; i <= idx; i++) {
        if (currentQuote[i] === ' ') { inWord = false; continue; }
        if (!inWord) { w++; inWord = true; }
    }
    return currentQuote[idx] === ' ' ? -1 : w;
}

// The word the cursor is "in": the word under it, or the word just finished when the cursor sits on a space.
function getCursorWordIndex() {
    if (!currentQuote.length) return -1;
    if (currentIndex < currentQuote.length && currentQuote[currentIndex] !== ' ') return getWordIndexForChar(currentIndex);
    if (currentIndex > 0 && currentQuote[currentIndex - 1] !== ' ') return getWordIndexForChar(currentIndex - 1);
    return -1;
}

function wordHasError(w) {
    if (w < 0) return false;
    if (extraChars[w]) return true;
    const range = wordRanges[w];
    if (!range) return false;
    const end = Math.min(range.end, currentIndex);
    for (let i = range.start; i < end; i++) {
        if (typedChars[i] !== currentQuote[i]) return true;
    }
    return false;
}

function markSpanDirty(i) { if (i >= 0) engineFrame.spans.add(i); }
function markWordDirty(w) { if (w >= 0) engineFrame.words.add(w); }
function leaveWord(w) {
    if (w < 0) return;
    wordErrorFlags[w] = wordHasError(w);
    markWordDirty(w);
}

// ── Input model (state only; the DOM is updated in the next frame) ─────────
// Returns { accepted, kind } where kind is char | space | skip | extra | blocked | ignored.
function engineTypeChar(ch) {
    const len = currentQuote.length;
    const atEnd = currentIndex >= len;
    const expected = atEnd ? '' : currentQuote[currentIndex];
    const atWordEnd = atEnd || expected === ' ';
    const w = getCursorWordIndex();
    const atWordStart = !atWordEnd && (currentIndex === 0 || currentQuote[currentIndex - 1] === ' ');
    const stop = engineOptions.stopOnError;

    if (ch === ' ') {
        if (atWordStart) return { accepted: false, kind: 'ignored' }; // leading or double space
        if (atWordEnd) {
            if (atEnd) return { accepted: false, kind: 'ignored' };
            if (stop === 'word' && wordHasError(w)) return { accepted: false, kind: 'blocked', wordIndex: w };
            keyStrokes++;
            typedChars[currentIndex] = ' ';
            markSpanDirty(currentIndex);
            currentIndex++;
            markSpanDirty(currentIndex);
            leaveWord(w);
            return { accepted: true, kind: 'space', index: currentIndex - 1, wordIndex: w, matches: true };
        }
        // Space in the middle of a word: the rest of the word counts as missed and the cursor jumps on.
        if (stop === 'letter' || stop === 'word') {
            keyStrokes++;
            mistakeCount++;
            return { accepted: false, kind: 'blocked', wordIndex: w };
        }
        const range = wordRanges[w] || { start: currentIndex, end: currentIndex };
        const skipped = range.end - currentIndex;
        keyStrokes++;
        mistakeCount += skipped;
        for (let i = currentIndex; i < range.end; i++) { typedChars[i] = ''; markSpanDirty(i); }
        if (range.end < len) { typedChars[range.end] = ' '; markSpanDirty(range.end); }
        currentIndex = Math.min(len, range.end + 1);
        markSpanDirty(currentIndex);
        leaveWord(w);
        return { accepted: true, kind: 'skip', skipped, wordIndex: w, matches: false };
    }

    if (atWordEnd) {
        // Extra letter typed past the end of the word
        if (stop === 'letter') {
            keyStrokes++;
            mistakeCount++;
            return { accepted: false, kind: 'blocked', wordIndex: w };
        }
        const cur = extraChars[w] || '';
        if (w < 0 || cur.length >= MAX_EXTRA_CHARS_PER_WORD) return { accepted: false, kind: 'ignored' };
        keyStrokes++;
        mistakeCount++;
        extraChars[w] = cur + ch;
        markWordDirty(w);
        return { accepted: true, kind: 'extra', wordIndex: w, matches: false };
    }

    const matches = typedCharMatches(ch, expected);
    keyStrokes++;
    if (!matches) {
        mistakeCount++;
        if (stop === 'letter') return { accepted: false, kind: 'blocked', wordIndex: w, matches: false };
    }
    typedChars[currentIndex] = matches ? expected : ch;
    markSpanDirty(currentIndex);
    currentIndex++;
    markSpanDirty(currentIndex);
    if (currentIndex === len) leaveWord(w);
    return { accepted: true, kind: 'char', index: currentIndex - 1, wordIndex: w, matches };
}

// Returns true if anything was deleted. wordMode = Ctrl/Cmd+Backspace.
function engineBackspace(wordMode) {
    const w = getCursorWordIndex();
    const atWordEnd = currentIndex >= currentQuote.length || currentQuote[currentIndex] === ' ';
    const extrasHere = atWordEnd && w >= 0 && extraChars[w] ? extraChars[w].length : 0;

    if (wordMode) {
        let removed = 0;
        if (extrasHere) { removed += extrasHere; extraChars[w] = ''; markWordDirty(w); }
        let target = currentIndex;
        // At a word start: the previous word is the one being deleted (strict mode protects a correct one)
        if (currentIndex > 0 && currentQuote[currentIndex - 1] === ' ') {
            const prevW = getWordIndexForChar(currentIndex - 2);
            if (engineOptions.strictBackspace && prevW >= 0 && !wordHasError(prevW)) {
                if (removed) backspaces += removed;
                return removed > 0;
            }
        }
        while (target > 0 && currentQuote[target - 1] === ' ') target--;
        while (target > 0 && currentQuote[target - 1] !== ' ') target--;
        const count = currentIndex - target;
        if (count <= 0 && !removed) return false;
        for (let i = target; i <= currentIndex; i++) markSpanDirty(i);
        const reentered = target < currentQuote.length ? getWordIndexForChar(target) : -1;
        currentIndex = target;
        typedChars.length = currentIndex;
        if (reentered >= 0) { wordErrorFlags[reentered] = false; markWordDirty(reentered); }
        backspaces += count + removed;
        return true;
    }

    if (extrasHere) {
        extraChars[w] = extraChars[w].slice(0, -1);
        backspaces++;
        markWordDirty(w);
        return true;
    }
    if (currentIndex === 0) return false;
    if (currentQuote[currentIndex - 1] === ' ') {
        // Going back into the previous word
        const prevW = getWordIndexForChar(currentIndex - 2);
        if (engineOptions.strictBackspace && prevW >= 0 && !wordHasError(prevW)) return false;
        markSpanDirty(currentIndex);
        currentIndex--;
        markSpanDirty(currentIndex);
        // Jump over letters that were skipped with Space, back to the last letter actually typed
        while (currentIndex > 0 && typedChars[currentIndex - 1] === '') { currentIndex--; markSpanDirty(currentIndex); }
        typedChars.length = currentIndex;
        if (prevW >= 0) { wordErrorFlags[prevW] = false; markWordDirty(prevW); }
        backspaces++;
        return true;
    }
    markSpanDirty(currentIndex);
    currentIndex--;
    markSpanDirty(currentIndex);
    typedChars.length = currentIndex;
    backspaces++;
    return true;
}

// ── Per-frame DOM batching ─────────────────────────────────────────────────
// All keystroke DOM work runs once per animation frame: class writes, then one layout read,
// then the overlay writes (caret, pace marker, scroll, laser, particles).
const engineFrame = {
    spans: new Set(), words: new Set(), appendFrom: null,
    caret: false, pace: false, scroll: false, aura: false, laser: false, stats: false,
    laserShotWord: -1, shatterWords: [], trail: false, xzChar: '',
};
let engineFrameHandle = 0;
let engineFrameFallback = 0;
function scheduleEngineFrame() {
    if (engineFrameHandle) return;
    engineFrameHandle = requestAnimationFrame(flushEngineFrame);
    // Background tabs stop animation frames; keep the display honest with a slow fallback.
    engineFrameFallback = setTimeout(() => {
        if (!engineFrameHandle) return;
        cancelAnimationFrame(engineFrameHandle);
        flushEngineFrame();
    }, 120);
}

function caretAnchorInfo() {
    // Which element the caret sits after/on. Returns { el, after } (after = place caret at the element's right edge).
    const w = getCursorWordIndex();
    const atWordEnd = currentIndex >= currentQuote.length || currentQuote[currentIndex] === ' ';
    if (atWordEnd && w >= 0 && extraSpans[w] && extraSpans[w].length) {
        return { el: extraSpans[w][extraSpans[w].length - 1], after: true };
    }
    if (currentIndex < charSpans.length) return { el: charSpans[currentIndex], after: false };
    if (charSpans.length) return { el: charSpans[charSpans.length - 1], after: true };
    return { el: null, after: false };
}

function flushEngineFrame() {
    engineFrameHandle = 0;
    clearTimeout(engineFrameFallback);
    const f = engineFrame;
    if (!quoteDisplay) return;

    // ── Phase 1: writes only ──
    if (f.appendFrom != null) {
        const from = Math.min(f.appendFrom, charSpans.length);
        f.appendFrom = null;
        if (from < currentQuote.length) appendQuoteSpans(from);
    }
    if (f.spans.size) {
        for (const i of f.spans) updateCharSpan(i);
        f.spans.clear();
    }
    if (f.words.size) {
        for (const w of f.words) syncWordExtras(w);
        f.words.clear();
    }
    if (f.stats) { f.stats = false; writeLiveStats(); }
    if (f.aura) { f.aura = false; applyAuraStyles(); }
    const effectsOn = miningVisualsEnabled && startTime && !isComplete;
    const wantLaserShot = effectsOn && f.laserShotWord >= 0;
    const wantLaser = effectsOn && (f.laser || wantLaserShot);
    const wantShatter = effectsOn && f.shatterWords.length > 0;
    const wantTrail = f.trail && isRewardActive('nebulaTrail');
    const wantXz = !!f.xzChar;
    const compact = quoteDisplay.classList.contains('words30-compact');

    // ── Phase 2: one batch of layout reads ──
    let caretBox = null;
    if (f.caret || f.scroll || wantTrail || wantXz) {
        const a = caretAnchorInfo();
        if (a.el) {
            caretBox = { x: a.el.offsetLeft, y: a.el.offsetTop, w: a.el.offsetWidth, h: a.el.offsetHeight, after: a.after };
        }
    }
    let scrollBox = null;
    if (f.scroll && compact) scrollBox = { scrollWidth: quoteDisplay.scrollWidth, clientWidth: quoteDisplay.clientWidth };
    let paceBox = null;
    const paceVisible = ghostCursorEnabled && ghostReplayIndex >= 0 && ghostReplayIndex < charSpans.length && ghostReplayIndex !== currentIndex && !isComplete;
    if (f.pace && paceVisible) {
        const el = charSpans[ghostReplayIndex];
        paceBox = { x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight };
    }
    let shatterBoxes = null;
    if (wantShatter) {
        shatterBoxes = f.shatterWords.map((w) => {
            const el = wordSpans[w];
            return el ? { x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight } : null;
        });
    }
    let laserGeom = null;
    if (wantLaser) {
        const anchor = wantLaserShot ? (wordSpans[f.laserShotWord] || null) : getMiningLaserAnchorElement();
        laserGeom = anchor ? measureMiningLaserGeometry(anchor) : null;
    }

    // ── Phase 3: writes ──
    if (f.caret || f.scroll) {
        if (caretBox) positionCaret(caretBox);
        f.caret = false;
    }
    if (f.scroll) {
        f.scroll = false;
        if (compact && scrollBox && caretBox) {
            const maxScroll = Math.max(0, scrollBox.scrollWidth - scrollBox.clientWidth);
            const leadSpace = Math.max(72, scrollBox.clientWidth * 0.28);
            const target = Math.max(0, Math.min(maxScroll, caretBox.x - leadSpace));
            if (quoteDisplay.scrollLeft !== target) quoteDisplay.scrollLeft = target;
        }
    }
    if (f.pace) {
        f.pace = false;
        if (paceBox) {
            paceMarkerEl.style.transform = `translate(${(paceBox.x - 1).toFixed(1)}px, ${paceBox.y.toFixed(1)}px)`;
            paceMarkerEl.style.height = `${paceBox.h}px`;
            paceMarkerEl.classList.add('show');
        } else {
            paceMarkerEl.classList.remove('show');
        }
    }
    if (wantShatter) {
        f.shatterWords.forEach((w, i) => { if (shatterBoxes[i]) emitMiningShatterParticles(shatterBoxes[i]); });
    }
    f.shatterWords.length = 0;
    if (wantLaser) {
        if (laserGeom) {
            writeMiningLaserPosition(laserGeom);
            if (wantLaserShot) writeMiningLaserShot(laserGeom);
        } else {
            clearMiningLaserOverlay();
        }
    } else if (f.laser && !effectsOn) {
        clearMiningLaserOverlay();
    }
    f.laser = false;
    f.laserShotWord = -1;
    if (wantTrail && caretBox) emitNebulaParticles(caretBox);
    f.trail = false;
    if (wantXz && caretBox) emitXzLaserParticle(caretBox);
    f.xzChar = '';
}

function updateCaretStyleClasses() {
    caretEl.classList.toggle('caret-block', engineOptions.caret === 'block');
    caretEl.classList.toggle('caret-line', engineOptions.caret === 'line');
    caretEl.classList.toggle('caret-underline', engineOptions.caret === 'underline');
    caretEl.classList.toggle('caret-off', engineOptions.caret === 'off');
    caretEl.classList.toggle('smooth', !!engineOptions.smoothCaret);
}

function positionCaret(box) {
    const style = engineOptions.caret;
    let x = box.after ? box.x + box.w : box.x;
    let y = box.y;
    let w = box.w || 10;
    let h = box.h || 20;
    if (style === 'line') { x -= 1; w = 2; }
    else if (style === 'underline') { y = y + h - 2; h = 2; }
    caretEl.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    caretEl.style.width = `${w}px`;
    caretEl.style.height = `${h}px`;
}

// Pause the blink briefly after each key so the caret is solid while typing.
function pulseCaretTyping() {
    caretEl.classList.add('typing');
    if (caretBlinkTimer) clearTimeout(caretBlinkTimer);
    caretBlinkTimer = setTimeout(() => { caretEl.classList.remove('typing'); caretBlinkTimer = null; }, 500);
}

// ── Mining visuals (effects) ───────────────────────────────────────────────
function emitMiningShatterParticles(box) {
    const centerX = box.x + box.w * 0.5;
    const centerY = box.y + box.h * 0.58;
    const burstCount = 18;
    const palette = ['#fde047', '#fb923c', '#f97316', '#ef4444', '#facc15'];
    const frag = document.createDocumentFragment();

    const core = document.createElement('span');
    core.className = 'mining-shatter-core';
    core.style.setProperty('--x', `${centerX.toFixed(1)}px`);
    core.style.setProperty('--y', `${centerY.toFixed(1)}px`);
    core.addEventListener('animationend', () => core.remove(), { once: true });
    frag.appendChild(core);

    for (let i = 0; i < burstCount; i++) {
        const p = document.createElement('span');
        p.className = 'mining-shatter-particle';
        const theta = (Math.PI * 2 * i / burstCount) + (Math.random() * 0.34);
        const travel = 16 + Math.random() * 24;
        const dx = Math.cos(theta) * travel;
        const dy = Math.sin(theta) * travel - (4 + Math.random() * 7);
        const size = 4 + Math.random() * 4;
        const duration = 0.3 + Math.random() * 0.16;
        const color = palette[Math.floor(Math.random() * palette.length)];
        p.style.setProperty('--x', `${centerX.toFixed(1)}px`);
        p.style.setProperty('--y', `${centerY.toFixed(1)}px`);
        p.style.setProperty('--dx', `${dx.toFixed(1)}px`);
        p.style.setProperty('--dy', `${dy.toFixed(1)}px`);
        p.style.setProperty('--size', `${size.toFixed(1)}px`);
        p.style.setProperty('--dur', `${duration.toFixed(2)}s`);
        p.style.setProperty('--pixel', color);
        p.addEventListener('animationend', () => p.remove(), { once: true });
        frag.appendChild(p);
    }
    quoteDisplay.appendChild(frag);
}

// Kept for callers that want the effect on a word: queued for the next frame.
function emitMiningShatterAtWord(wordIndex) {
    if (!miningVisualsEnabled) return;
    if (wordIndex < 0 || wordIndex >= wordSpans.length) return;
    engineFrame.shatterWords.push(wordIndex);
    scheduleEngineFrame();
}

function maybeTriggerMiningShatter(typedIndex) {
    if (!miningVisualsEnabled) return;
    const idx = Number(typedIndex);
    if (!Number.isFinite(idx) || idx < 0 || idx >= currentQuote.length) return;
    if (typedChars[idx] !== currentQuote[idx]) return;
    const nextChar = currentQuote[idx + 1];
    if (idx !== currentQuote.length - 1 && nextChar !== ' ') return;
    const wordIndex = getWordIndexForChar(idx);
    if (wordIndex < 0 || wordIndex >= wordRanges.length) return;
    const range = wordRanges[wordIndex];
    if (!range) return;
    for (let i = range.start; i < range.end; i++) {
        if (typedChars[i] !== currentQuote[i]) return;
    }
    emitMiningShatterAtWord(wordIndex);
    if (miningLaserSoundEnabled) playSound(SFX.laser);
}

function clearMiningLaserOverlay() {
    if (!miningLaserOverlay) return;
    miningLaserOverlay.classList.remove('show');
}

function getMiningLaserAnchorElement(charIndex = null) {
    if (Number.isFinite(charIndex)) {
        const widx = getWordIndexForChar(charIndex);
        if (widx >= 0 && wordSpans[widx]) return wordSpans[widx];
    }
    const currentWordIndex = getCurrentWordIndex();
    if (currentWordIndex >= 0 && wordSpans[currentWordIndex]) return wordSpans[currentWordIndex];
    if (currentIndex > 0 && charSpans[currentIndex - 1]) return charSpans[currentIndex - 1];
    return charSpans[Math.max(0, Math.min(currentIndex, charSpans.length - 1))] || null;
}

// Read phase: two rect reads back to back (one layout).
function measureMiningLaserGeometry(anchor) {
    if (!miningLaserOverlay || !anchor) return null;
    const typingArea = document.getElementById('typing-area');
    if (!typingArea || typingArea.style.display === 'none' || !charSpans.length || quoteDisplay.offsetParent === null) return null;
    const rect = anchor.getBoundingClientRect();
    const quoteRect = quoteDisplay.getBoundingClientRect();
    const targetX = rect.left + (rect.width * 0.5);
    const targetY = rect.top + (rect.height * 0.58);
    const shipHeight = 38;
    const originX = quoteRect.right - 44;
    const shipBottom = Math.max(0, window.innerHeight - quoteRect.bottom + 8);
    const originYFromBottom = shipBottom + (shipHeight * 0.52);
    const originY = window.innerHeight - originYFromBottom;
    const dx = targetX - originX;
    const dy = targetY - originY;
    if (dy > -6) return null;
    const length = Math.max(0, Math.sqrt((dx * dx) + (dy * dy)));
    const angleDeg = Math.atan2(dx, -dy) * 180 / Math.PI;
    const shipAngle = Math.atan2(dy, dx) * 180 / Math.PI;
    const wpm = getWPM(getElapsed());
    const speedRatio = Math.max(0, Math.min(1, wpm / 140));
    const hue = Math.round(286 - speedRatio * 136);
    const beamWidth = (11 + speedRatio * 9).toFixed(2);
    const coreWidth = (2.2 + speedRatio * 2.1).toFixed(2);
    return { originX, originY, originYFromBottom, shipBottom, shipAngle, length, angleDeg, hue, beamWidth, coreWidth };
}

function writeMiningLaserPosition(g) {
    if (miningLaserShip && !miningLaserShip.firstElementChild) {
        miningLaserShip.innerHTML = getCommunityShipSprite('player');
    }
    miningLaserOverlay.style.setProperty('--laser-origin-x', `${g.originX.toFixed(1)}px`);
    miningLaserOverlay.style.setProperty('--ship-bottom', `${g.shipBottom.toFixed(1)}px`);
    miningLaserOverlay.style.setProperty('--ship-angle', `${g.shipAngle.toFixed(2)}deg`);
    miningLaserOverlay.classList.add('show');
}

function writeMiningLaserShot(g) {
    const shot = document.createElement('span');
    shot.className = 'mining-laser-shot';
    shot.style.setProperty('--shot-origin-x', `${g.originX.toFixed(1)}px`);
    shot.style.setProperty('--shot-origin-y', `${g.originYFromBottom.toFixed(1)}px`);
    shot.style.setProperty('--shot-length', `${g.length.toFixed(1)}px`);
    shot.style.setProperty('--shot-angle', `${g.angleDeg.toFixed(2)}deg`);
    shot.style.setProperty('--shot-hue', String(g.hue));
    shot.style.setProperty('--shot-width', `${g.beamWidth}px`);
    const core = document.createElement('span');
    core.className = 'mining-laser-shot-core';
    core.style.setProperty('--shot-origin-x', `${g.originX.toFixed(1)}px`);
    core.style.setProperty('--shot-origin-y', `${g.originYFromBottom.toFixed(1)}px`);
    core.style.setProperty('--shot-length', `${g.length.toFixed(1)}px`);
    core.style.setProperty('--shot-angle', `${g.angleDeg.toFixed(2)}deg`);
    core.style.setProperty('--shot-hue', String(g.hue));
    core.style.setProperty('--shot-core-width', `${g.coreWidth}px`);
    miningLaserOverlay.appendChild(shot);
    miningLaserOverlay.appendChild(core);
    shot.addEventListener('animationend', () => shot.remove(), { once: true });
    core.addEventListener('animationend', () => core.remove(), { once: true });
}

// Points the ship at the active word (queued for the next frame).
function updateMiningLaserAtActiveWord() {
    if (!miningLaserOverlay) return;
    if (!miningVisualsEnabled || !startTime || isComplete) {
        clearMiningLaserOverlay();
        return;
    }
    engineFrame.laser = true;
    scheduleEngineFrame();
}

// Fires a shot at the word that holds typedIndex (queued for the next frame).
function emitMiningLaserShotAtWord(typedIndex = null) {
    if (!miningVisualsEnabled || !miningLaserOverlay) return;
    const w = Number.isFinite(typedIndex) ? getWordIndexForChar(typedIndex) : getCurrentWordIndex();
    if (w < 0) return;
    engineFrame.laserShotWord = w;
    scheduleEngineFrame();
}

function emitMiningLaserShotCustom({ originX, originY, targetX, targetY } = {}) {
    if ((!miningVisualsEnabled && !isLyraGateOpen()) || !miningLaserOverlay) return;
    const ox = Number(originX);
    const oy = Number(originY);
    const tx = Number(targetX);
    const ty = Number(targetY);
    if (!Number.isFinite(ox) || !Number.isFinite(oy) || !Number.isFinite(tx) || !Number.isFinite(ty)) return;
    const dx = tx - ox;
    const dy = ty - oy;
    const length = Math.hypot(dx, dy);
    if (length < 2) return;
    if (miningLaserShip && !miningLaserShip.firstElementChild) {
        miningLaserShip.innerHTML = getCommunityShipSprite('player');
    }

    const shipHeight = 38;
    const originYFromBottom = Math.max(0, window.innerHeight - oy);
    const shipBottom = Math.max(0, originYFromBottom - (shipHeight * 0.52));
    const shipAngle = Math.atan2(dy, dx) * 180 / Math.PI;
    const angleDeg = Math.atan2(dx, -dy) * 180 / Math.PI;
    const wpm = getWPM(getElapsed());
    const speedRatio = Math.max(0, Math.min(1, wpm / 140));
    const hue = Math.round(286 - speedRatio * 136);
    const beamWidth = (11 + speedRatio * 9).toFixed(2);
    const coreWidth = (2.2 + speedRatio * 2.1).toFixed(2);

    // Lyra runs inside a modal; force the shared laser overlay above all modal chrome.
    miningLaserOverlay.style.zIndex = isLyraGateOpen() ? '5000' : '120';
    miningLaserOverlay.style.display = 'block';
    miningLaserOverlay.style.opacity = '1';
    writeMiningLaserPosition({ originX: ox, shipBottom, shipAngle });
    writeMiningLaserShot({ originX: ox, originYFromBottom, length, angleDeg, hue, beamWidth, coreWidth });
}

// Only the previously active word and the new one are touched.
function applyAuraStyles() {
    if (!isRewardActive('aura')) {
        if (activeAuraWordIndex >= 0 && wordSpans[activeAuraWordIndex]) wordSpans[activeAuraWordIndex].classList.remove('word-aura-active');
        activeAuraWordIndex = -1;
        return;
    }
    const targetWordIndex = getCurrentWordIndex();
    if (targetWordIndex !== activeAuraWordIndex) {
        if (activeAuraWordIndex >= 0 && wordSpans[activeAuraWordIndex]) wordSpans[activeAuraWordIndex].classList.remove('word-aura-active');
        activeAuraWordIndex = -1;
    }
    if (targetWordIndex < 0 || targetWordIndex >= wordSpans.length) return;

    const wpm = getWPM(getElapsed());
    const speedRatio = Math.max(0, Math.min(1, wpm / 140));
    const hue = Math.round(215 - speedRatio * 95);
    const alpha = (0.18 + speedRatio * 0.2).toFixed(3);
    const ringAlpha = (0.38 + speedRatio * 0.3).toFixed(3);
    quoteDisplay.style.setProperty('--aura-bg', `hsla(${hue}, 88%, 62%, ${alpha})`);
    quoteDisplay.style.setProperty('--aura-ring', `hsla(${hue}, 92%, 67%, ${ringAlpha})`);
    quoteDisplay.style.setProperty('--aura-glow', `hsla(${hue}, 96%, 72%, ${alpha})`);
    if (targetWordIndex !== activeAuraWordIndex) {
        wordSpans[targetWordIndex].classList.add('word-aura-active');
        activeAuraWordIndex = targetWordIndex;
    }
}

function emitNebulaParticles(box) {
    const baseX = box.x + box.w * 0.5;
    const baseY = box.y + box.h * 0.56;
    const particleCount = 3;
    const frag = document.createDocumentFragment();
    for (let i = 0; i < particleCount; i++) {
        const p = document.createElement('span');
        p.className = 'nebula-particle';
        const hue = 180 + Math.floor(Math.random() * 145);
        const sat = 82 + Math.floor(Math.random() * 16);
        const light = 58 + Math.floor(Math.random() * 18);
        const alpha = (0.38 + Math.random() * 0.28).toFixed(3);
        const spreadX = (Math.random() * 14 - 7);
        const spreadY = (Math.random() * 10 - 5);
        const dx = (Math.random() * 34 - 10).toFixed(1);
        const dy = (-8 - Math.random() * 26).toFixed(1);
        const size = (6 + Math.random() * 10).toFixed(1);
        const duration = (0.5 + Math.random() * 0.42).toFixed(2);
        p.style.setProperty('--x', `${(baseX + spreadX).toFixed(1)}px`);
        p.style.setProperty('--y', `${(baseY + spreadY).toFixed(1)}px`);
        p.style.setProperty('--dx', `${dx}px`);
        p.style.setProperty('--dy', `${dy}px`);
        p.style.setProperty('--size', `${size}px`);
        p.style.setProperty('--dur', `${duration}s`);
        p.style.setProperty('--nebula', `hsla(${hue}, ${sat}%, ${light}%, ${alpha})`);
        p.addEventListener('animationend', () => p.remove(), { once: true });
        frag.appendChild(p);
    }
    quoteDisplay.appendChild(frag);
}

// Queues the nebula trail at the caret for the next frame (reward effect).
function emitNebulaTrailAtCursor(force = false) {
    if (!force && !isRewardActive('nebulaTrail')) return;
    if (!quoteDisplay || !charSpans.length) return;
    engineFrame.trail = true;
    scheduleEngineFrame();
}

function emitXzLaserParticle(box) {
    const laser = document.createElement('span');
    laser.className = 'xz-laser-icon';
    laser.textContent = '✦';
    laser.style.left = `${(box.x + box.w * 0.5).toFixed(1)}px`;
    laser.style.top = `${(box.y + box.h * 0.55).toFixed(1)}px`;
    quoteDisplay.appendChild(laser);
    laser.addEventListener('animationend', () => laser.remove(), { once: true });
}

function emitXzLaserAtCursor(keyChar) {
    if (activeCommunityBoostMode !== 'targeted_weakness' || currentMode !== 'community') return;
    const lower = String(keyChar || '').toLowerCase();
    if (lower !== 'x' && lower !== 'z') return;
    engineFrame.xzChar = lower;
    scheduleEngineFrame();
}

function previewAuraRewardAt(targetId = 'aura-preview-word') {
    const target = document.getElementById(String(targetId || 'aura-preview-word'));
    if (!target) return;

    const hue = 195 + Math.round(Math.random() * 85);
    target.style.setProperty('--aura-bg', `hsla(${hue}, 90%, 64%, 0.24)`);
    target.style.setProperty('--aura-ring', `hsla(${hue}, 96%, 70%, 0.62)`);
    target.style.setProperty('--aura-glow', `hsla(${hue}, 96%, 74%, 0.45)`);
    target.classList.remove('aura-on');
    target.getBoundingClientRect();
    target.classList.add('aura-on');
    setTimeout(() => target.classList.remove('aura-on'), 1200);
}
function previewAuraReward() {
    previewAuraRewardAt('aura-preview-word');
}

function previewNebulaTrailRewardAt(stageId = 'nebula-preview-stage') {
    const stage = document.getElementById(String(stageId || 'nebula-preview-stage'));
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    const baseX = rect.width * 0.76;
    const baseY = rect.height * 0.5;
    for (let i = 0; i < 9; i++) {
        const p = document.createElement('span');
        p.className = 'nebula-particle';
        const hue = 180 + Math.floor(Math.random() * 145);
        const sat = 82 + Math.floor(Math.random() * 16);
        const light = 58 + Math.floor(Math.random() * 18);
        const alpha = (0.38 + Math.random() * 0.28).toFixed(3);
        const spreadX = (Math.random() * 18 - 9);
        const spreadY = (Math.random() * 12 - 6);
        const dx = (Math.random() * 30 - 34).toFixed(1);
        const dy = (-6 - Math.random() * 20).toFixed(1);
        const size = (6 + Math.random() * 10).toFixed(1);
        const duration = (0.48 + Math.random() * 0.38).toFixed(2);

        p.style.setProperty('--x', `${(baseX + spreadX).toFixed(1)}px`);
        p.style.setProperty('--y', `${(baseY + spreadY).toFixed(1)}px`);
        p.style.setProperty('--dx', `${dx}px`);
        p.style.setProperty('--dy', `${dy}px`);
        p.style.setProperty('--size', `${size}px`);
        p.style.setProperty('--dur', `${duration}s`);
        p.style.setProperty('--nebula', `hsla(${hue}, ${sat}%, ${light}%, ${alpha})`);
        stage.appendChild(p);
        p.addEventListener('animationend', () => p.remove(), { once: true });
    }
}
function previewNebulaTrailReward() {
    previewNebulaTrailRewardAt('nebula-preview-stage');
}

// ── Stats ──────────────────────────────────────────────────────────────────
function getElapsed() {
    return startTime ? (performance.now() - startTime) / 1000 : 0;
}

function countCorrectChars() {
    let correct = 0;
    for (let i = 0; i < currentIndex; i++)
        if (typedChars[i] === currentQuote[i]) correct++;
    return correct;
}

function getWPM(elapsed) {
    if (!elapsed) return 0;
    return Math.round((countCorrectChars() / 5) / (elapsed / 60));
}

function getRawWPM(elapsed) {
    if (!elapsed) return 0;
    // Raw WPM counts every typed character (backspaces are not keystrokes here).
    return Math.round((keyStrokes / 5) / (elapsed / 60));
}

function getAccuracy() {
    // Keystroke-based (Monkeytype style): corrected mistakes still count as errors.
    if (keyStrokes === 0) return null;
    const pct = Math.max(0, Math.round(((keyStrokes - mistakeCount) / keyStrokes) * 100));
    // Never show a perfect 100% once any mistake was made, even if it was corrected.
    return mistakeCount > 0 ? Math.min(pct, 99) : pct;
}

function getBurstSeries() {
    return wpmSamples.map(s => (Number.isFinite(s.burst) ? s.burst : s.wpm));
}

// Monkeytype's consistency: coefficient of variation of the per-second series through a tanh curve.
function getConsistency() {
    const values = getBurstSeries();
    if (values.length < 2) return 100;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    if (mean <= 0) return 0;
    const variance = values.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / values.length;
    const cv = Math.sqrt(variance) / mean;
    const mapped = 100 * (1 - Math.tanh(cv + Math.pow(cv, 3) / 3 + Math.pow(cv, 5) / 5));
    return Math.max(0, Math.min(100, Math.round(mapped)));
}

function getPeakWpm(fallback = 0) {
    const values = getBurstSeries().filter(v => v > 0);
    return values.length ? Math.max(...values) : fallback;
}

function countUncorrectedErrors() {
    let n = 0;
    for (let i = 0; i < currentIndex; i++) if (typedChars[i] !== currentQuote[i]) n++;
    for (let w = 0; w < extraChars.length; w++) if (extraChars[w]) n += extraChars[w].length;
    return n;
}

function countTypedWords() {
    let typed = 0, correct = 0;
    for (let w = 0; w < wordRanges.length; w++) {
        const r = wordRanges[w];
        if (r.start >= currentIndex) break;
        typed++;
        if (r.end <= currentIndex && !wordHasError(w)) correct++;
    }
    return { typed, correct };
}

// Everything the results screen needs, in one place.
function getRunStats(elapsedOverride) {
    const elapsedRaw = elapsedOverride != null ? elapsedOverride : (pendingResultElapsed != null ? pendingResultElapsed : getElapsed());
    const elapsed = isTimedMode() ? Math.min(elapsedRaw, RANDOM_WORDS_DURATION) : elapsedRaw;
    const wpm = getWPM(elapsed);
    const words = countTypedWords();
    const correctChars = countCorrectChars();
    let extraTotal = 0;
    for (let w = 0; w < extraChars.length; w++) if (extraChars[w]) extraTotal += extraChars[w].length;
    let missedChars = 0;
    for (let i = 0; i < currentIndex; i++) if (typedChars[i] === '') missedChars++;
    return {
        wpm,
        rawWpm: getRawWPM(elapsed),
        accuracy: getAccuracy() ?? 0,
        consistency: getConsistency(),
        peakWpm: getPeakWpm(wpm),
        burstSeries: wpmSamples.map(s => ({ t: s.t, wpm: Number.isFinite(s.burst) ? s.burst : s.wpm, raw: Number.isFinite(s.rawBurst) ? s.rawBurst : s.wpm })),
        cumulativeSeries: wpmSamples.map(s => ({ t: s.t, wpm: s.wpm, raw: Number.isFinite(s.raw) ? s.raw : s.wpm })),
        mistakes: mistakeCount,
        uncorrected: countUncorrectedErrors(),
        keystrokes: keyStrokes,
        backspaces,
        typedWords: words.typed,
        correctWords: words.correct,
        typedChars: currentIndex + extraTotal,
        correctChars,
        incorrectChars: Math.max(0, currentIndex - correctChars - missedChars),
        missedChars,
        extraChars: extraTotal,
        time: Math.round(elapsed),
        elapsed,
        mode: currentMode,
        modeLabel: getModeLabel(),
        duration: isTimedMode() ? RANDOM_WORDS_DURATION : null,
        seed: currentTestSeed,
        options: Object.assign({}, engineOptions),
        text: currentQuote,
    };
}
window.getRunStats = getRunStats;

function writeLiveStats() {
    const elapsed  = getElapsed();
    const acc = getAccuracy();
    wpmEl.textContent      = elapsed >= 1 ? getWPM(elapsed) : 0;
    accuracyEl.textContent = acc !== null ? acc + '%' : '—';
    const progress = isTimedMode()
        ? Math.min(100, (elapsed / RANDOM_WORDS_DURATION) * 100)
        : (currentQuote.length ? currentIndex / currentQuote.length * 100 : 0);
    progressEl.style.width = progress + '%';
}

// Writes the live numbers now and queues the effects that need a layout read.
function updateStats() {
    writeLiveStats();
    engineFrame.aura = true;
    if (miningVisualsEnabled && startTime && !isComplete) engineFrame.laser = true;
    scheduleEngineFrame();
}

// ── WPM Chart ──────────────────────────────────────────────────────────────
// Canvas sizes are cached by a ResizeObserver so drawing never forces a layout.
const chartSizeCache = new WeakMap();
const chartResizeObserver = (typeof ResizeObserver === 'function')
    ? new ResizeObserver((entries) => {
        for (const entry of entries) {
            const r = entry.contentRect;
            chartSizeCache.set(entry.target, { width: r.width, height: r.height });
        }
    })
    : null;
if (chartResizeObserver) {
    if (chartCanvas) chartResizeObserver.observe(chartCanvas);
    if (chartCanvasResult) chartResizeObserver.observe(chartCanvasResult);
}
function getChartSize(canvas) {
    const cached = chartSizeCache.get(canvas);
    if (cached && cached.width && cached.height) return cached;
    const rect = canvas.getBoundingClientRect();
    const size = { width: rect.width, height: rect.height };
    chartSizeCache.set(canvas, size);
    return size;
}

function tracePath(ctx, samples, key, toX, toY) {
    ctx.beginPath();
    ctx.moveTo(toX(samples[0].t), toY(samples[0][key]));
    for (let i = 1; i < samples.length; i++) {
        const p0 = samples[Math.max(i - 2, 0)];
        const p1 = samples[i - 1];
        const p2 = samples[i];
        const p3 = samples[Math.min(i + 1, samples.length - 1)];
        const cp1x = toX(p1.t)   + (toX(p2.t)   - toX(p0.t))   / 6;
        const cp1y = toY(p1[key]) + (toY(p2[key]) - toY(p0[key])) / 6;
        const cp2x = toX(p2.t)   - (toX(p3.t)   - toX(p1.t))   / 6;
        const cp2y = toY(p2[key]) - (toY(p3[key]) - toY(p1[key])) / 6;
        ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, toX(p2.t), toY(p2[key]));
    }
}

// samples: [{t, wpm, burst?}] — draws the cumulative WPM line and, when present, the per-second burst line.
function drawLineChart(canvas, samples) {
    if (samples.length < 2) return;

    const dpr  = window.devicePixelRatio || 1;
    const size = getChartSize(canvas);
    const cssW = size.width;
    const cssH = size.height;
    if (!cssW || !cssH) return;

    // Resize backing store only when dimensions change (avoids flicker)
    if (canvas.width  !== Math.round(cssW * dpr) ||
        canvas.height !== Math.round(cssH * dpr)) {
        canvas.width  = Math.round(cssW * dpr);
        canvas.height = Math.round(cssH * dpr);
    }

    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    const PAD  = { top: 14, right: 16, bottom: 28, left: 38 };
    const drawW = cssW - PAD.left - PAD.right;
    const drawH = cssH - PAD.top  - PAD.bottom;

    const hasBurst = samples.some(s => Number.isFinite(s.burst));
    const maxWpm = Math.max(...samples.map(s => Math.max(s.wpm, hasBurst ? (s.burst || 0) : 0)), 10);
    const yMax   = Math.ceil(maxWpm / 10) * 10;
    const xMax   = Math.max(samples[samples.length - 1].t, 5);

    const toX = t   => PAD.left + (t   / xMax) * drawW;
    const toY = wpm => PAD.top  + (1 - wpm / yMax) * drawH;

    // ── Grid + Y labels ──
    ctx.lineWidth   = 1;
    ctx.strokeStyle = '#2a2a45';
    ctx.fillStyle   = '#4b5568';
    ctx.font        = '10px system-ui, sans-serif';
    ctx.textAlign   = 'right';

    const yStep = yMax <= 40 ? 10 : yMax <= 80 ? 20 : yMax <= 160 ? 30 : 50;
    for (let w = 0; w <= yMax; w += yStep) {
        const y = toY(w);
        ctx.beginPath();
        ctx.moveTo(PAD.left, y);
        ctx.lineTo(PAD.left + drawW, y);
        ctx.stroke();
        ctx.fillText(w, PAD.left - 5, y + 3.5);
    }

    // ── X labels ──
    const xStep = xMax <= 10 ? 1 : xMax <= 30 ? 5 : xMax <= 60 ? 10 : 20;
    ctx.textAlign = 'center';
    for (let t = 0; t <= xMax; t += xStep) {
        ctx.fillText(t + 's', toX(t), PAD.top + drawH + 18);
    }

    // ── Burst (per-second) line, drawn first so the average sits on top ──
    if (hasBurst) {
        const burstSamples = samples.map(s => ({ t: s.t, v: Number.isFinite(s.burst) ? s.burst : s.wpm }));
        tracePath(ctx, burstSamples, 'v', toX, toY);
        ctx.strokeStyle = 'rgba(250, 204, 21, 0.55)';
        ctx.lineWidth   = 1.5;
        ctx.lineJoin    = 'round';
        ctx.stroke();
    }

    // ── Gradient fill ──
    const grad = ctx.createLinearGradient(0, PAD.top, 0, PAD.top + drawH);
    grad.addColorStop(0, 'rgba(124,111,247,0.35)');
    grad.addColorStop(1, 'rgba(124,111,247,0)');
    tracePath(ctx, samples, 'wpm', toX, toY);
    ctx.lineTo(toX(samples[samples.length - 1].t), toY(0));
    ctx.lineTo(toX(samples[0].t), toY(0));
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // ── Line ──
    tracePath(ctx, samples, 'wpm', toX, toY);
    ctx.strokeStyle = '#7c6ff7';
    ctx.lineWidth   = 2;
    ctx.lineJoin    = 'round';
    ctx.lineCap     = 'round';
    ctx.stroke();

    // ── Dot at latest point ──
    const last = samples[samples.length - 1];
    ctx.beginPath();
    ctx.arc(toX(last.t), toY(last.wpm), 4, 0, Math.PI * 2);
    ctx.fillStyle = '#7c6ff7';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(toX(last.t), toY(last.wpm), 2, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    if (hasBurst) {
        ctx.textAlign = 'left';
        ctx.fillStyle = 'rgba(250, 204, 21, 0.8)';
        ctx.fillText('each second', PAD.left + 4, PAD.top + 4);
        ctx.fillStyle = '#7c6ff7';
        ctx.fillText('average', PAD.left + 72, PAD.top + 4);
    }
}

function pushWpmSample(t, intervalSeconds) {
    const correct = countCorrectChars();
    const burst = Math.round(((correct - lastSampleCorrect) / 5) / (intervalSeconds / 60));
    const rawBurst = Math.round(((keyStrokes - lastSampleKeys) / 5) / (intervalSeconds / 60));
    lastSampleCorrect = correct;
    lastSampleKeys = keyStrokes;
    wpmSamples.push({ t, wpm: getWPM(t), raw: getRawWPM(t), burst: Math.max(0, burst), rawBurst: Math.max(0, rawBurst) });
}

function sampleWpm() {
    const elapsed = getElapsed();
    const sec     = Math.floor(elapsed);
    if (sec >= 1 && sec > lastSampleSec) {
        const interval = lastSampleSec < 0 ? sec : sec - lastSampleSec;
        lastSampleSec = sec;
        pushWpmSample(sec, interval);
    }
}

// Adds the last partial second when the run ends.
function finalizeSamples(elapsed) {
    const lastT = lastSampleSec < 0 ? 0 : lastSampleSec;
    const rest = elapsed - lastT;
    if (rest >= 0.5 && elapsed > 0) {
        lastSampleSec = Math.floor(elapsed);
        pushWpmSample(Number(elapsed.toFixed(2)), rest);
    }
}

function updateLiveChart() {
    if (!engineOptions.liveChart) return;
    if (wpmSamples.length < 2) return;
    drawLineChart(chartCanvas, wpmSamples);
}

function drawResultChart() {
    if (wpmSamples.length < 2) return;
    chartCanvasResult.style.display = 'block';
    requestAnimationFrame(() => drawLineChart(chartCanvasResult, wpmSamples));
}

function startTimer() {
    startTime   = performance.now();
    attemptTimeline = [{ t: 0, index: 0 }];
    stopTimer();
    timerHandle = setInterval(() => {
        const elapsed = getElapsed();
        if (isTimedMode()) {
            const remaining = Math.max(0, RANDOM_WORDS_DURATION - elapsed);
            timerEl.textContent = Math.ceil(remaining) + 's';
        } else {
            timerEl.textContent = Math.round(elapsed) + 's';
        }
        updateStats();
        if (activeCommunityBoostMode === 'kinetic_shielding' && currentMode === 'community' && communityModeRuntime && !communityModeRuntime.shieldBroken) {
            const runtime = communityModeRuntime;
            const wpmNow = getWPM(elapsed);
            if (elapsed >= runtime.graceSeconds && wpmNow < runtime.baselineWpm) {
                runtime.shieldBroken = true;
            } else {
                const dodges = Math.min(runtime.maxDodges, Math.floor((elapsed / RANDOM_WORDS_DURATION) * runtime.maxDodges));
                runtime.dodges = Math.max(runtime.dodges, dodges);
            }
            updateCommunityModePopup();
        }
        sampleWpm();
        updateLiveChart();
        updateGhostDelta(elapsed * 1000);
        if (ghostCursorEnabled && ghostTimeline.length > 0) {
            const nextGhost = Math.max(0, Math.min(currentQuote.length - 1, getGhostIndexAtElapsed(elapsed)));
            if (nextGhost !== ghostReplayIndex) {
                const oldGhost = ghostReplayIndex;
                ghostReplayIndex = nextGhost;
                markSpanDirty(oldGhost);
                markSpanDirty(nextGhost);
                engineFrame.pace = true;
                scheduleEngineFrame();
            }
        }

        if (isTimedMode() && elapsed >= RANDOM_WORDS_DURATION) {
            timerEl.textContent = '0s';
            completeRun(120);
            scheduleEngineFrame();
        }
    }, 150);
}

// Test hook: lets automated tests move the clock forward without waiting.
window.__engineTestHooks = {
    shiftStartTime(ms) { if (startTime) startTime -= Number(ms) || 0; },
    getState() { return { currentIndex, isComplete, startTime, keyStrokes, mistakeCount, backspaces, seed: currentTestSeed }; },
};
// ── Population ranking ─────────────────────────────────────────────────────
const RANK_TIERS = [
    { minWpm:   0, maxWpm:  20, percentile:  5, tier: 'Beginner'      },
    { minWpm:  20, maxWpm:  30, percentile: 15, tier: 'Below average' },
    { minWpm:  30, maxWpm:  40, percentile: 30, tier: 'Average'       },
    { minWpm:  40, maxWpm:  55, percentile: 50, tier: 'Above average' },
    { minWpm:  55, maxWpm:  70, percentile: 70, tier: 'Fast'          },
    { minWpm:  70, maxWpm:  90, percentile: 85, tier: 'Very fast'     },
    { minWpm:  90, maxWpm: 110, percentile: 94, tier: 'Expert'        },
    { minWpm: 110, maxWpm: 130, percentile: 98, tier: 'Elite'         },
    { minWpm: 130, maxWpm: Infinity, percentile: 99, tier: 'World-class' },
];

function getPopulationRank(wpm) {
    for (let idx = 0; idx < RANK_TIERS.length; idx++) {
        const t = RANK_TIERS[idx];
        if (wpm < t.maxWpm) {
            const range        = t.maxWpm === Infinity ? 20 : t.maxWpm - t.minWpm;
            const prevPct      = idx > 0 ? RANK_TIERS[idx - 1].percentile : 0;
            const frac         = Math.min((wpm - t.minWpm) / range, 1);
            const interp       = Math.round(prevPct + frac * (t.percentile - prevPct));
            return { percentile: Math.max(1, Math.min(99, interp)), tier: t.tier };
        }
    }
    return { percentile: 99, tier: 'World-class' };
}

// ── Utilities ──────────────────────────────────────────────────────────────
function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

let uiToastTimer = null;
function showUiMessage(message, type = 'error', ms = 2600, position = 'bottom') {
    const toast = document.getElementById('ui-toast');
    if (!toast) return;
    toast.textContent = String(message || '');
    toast.classList.remove('error', 'info', 'success', 'top-left');
    if (position === 'top-left') toast.classList.add('top-left');
    toast.classList.add(type === 'success' ? 'success' : (type === 'info' ? 'info' : 'error'));
    toast.classList.add('show');
    if (uiToastTimer) clearTimeout(uiToastTimer);
    uiToastTimer = setTimeout(() => {
        toast.classList.remove('show');
    }, Math.max(900, ms || 0));
}

// ── History ────────────────────────────────────────────────────────────────
const HISTORY_KEY = 'sampire-typing-history';
const MAX_HISTORY = 50;
const AUTH_TOKEN_KEY = 'sampire-auth-token';
const LOCAL_AUTH_TOKEN_KEY = 'sampire-local-auth-token';
const LOCAL_AUTH_USERS_KEY = 'sampire-local-auth-users';
const LOCAL_AUTH_SCORES_KEY = 'sampire-local-auth-scores';
const LOCAL_GUEST_SCORES_KEY = 'sampire-local-guest-scores';
const GUEST_SESSION_ID_KEY = 'sampire-guest-session-id';
const GUEST_LOCATION_CACHE_KEY = 'sampire-guest-location-cache';
const GHOST_CURSOR_ENABLED_KEY = 'sampire-ghost-cursor-enabled';
const MINING_VISUALS_ENABLED_KEY = 'sampire-mining-visuals-enabled';
const MINING_LASER_SOUND_ENABLED_KEY = 'sampire-mining-laser-sound-enabled';
const BIBLE_MODE_KEY = 'sampire-bible-mode';
const LIFETIME_TESTS_KEY = 'sampire-lifetime-tests-completed';
const LIFETIME_WORDS_TYPED_KEY = 'sampire-lifetime-words-typed';
const LIFETIME_TIME_SECONDS_KEY = 'sampire-lifetime-time-seconds';
const LIFETIME_BEST_WPM_KEY = 'sampire-lifetime-best-wpm';
const LIFETIME_BIBLE_TESTS_KEY = 'sampire-lifetime-bible-tests-completed';
const STORAGE_SAFETY_SNAPSHOT_KEY = 'sampire-storage-snapshot-v1';
const PROGRESS_OWNER_KEY = 'sampire-progress-owner';
const SYNC_PROGRESS_KEYS = [
    HISTORY_KEY,
    'sampire-xp',
    'sampire-lifetime-challenges-completed',
    LIFETIME_TESTS_KEY,
    LIFETIME_WORDS_TYPED_KEY,
    LIFETIME_TIME_SECONDS_KEY,
    LIFETIME_BEST_WPM_KEY,
    LIFETIME_BIBLE_TESTS_KEY,
    'sampire-streak',
    'sampire-badges',
    'sampire-daily',
    'sampire-daily-v2',
    'sampire-weekly',
    'sampire-weekly-rival-target',
    'sampire-skill-points',
    'sampire-skills',
    'sampire-reward-settings',
    'sampire-active-soundscape',
    'sampire-music-muted',
    'sampire-music-volume',
    'sampire-key-sounds-enabled',
    'sampire-key-sound-volume',
    MINING_VISUALS_ENABLED_KEY,
    MINING_LASER_SOUND_ENABLED_KEY,
    BIBLE_MODE_KEY,
    'sampire-key-sound-pack',
    'sampire-mining-state-v1',
    'sampire-weekly-words',
    'sampire-friends-cache',
    // Wave 2 progression keys (day log, lifetime counters, crystal ledger, equipped title/colours, recap marker)
    'sampire-daily-stats',
    'sampire-lifetime-counters',
    'sampire-crystal-ledger',
    'sampire-title',
    'sampire-weekly-recap-seen',
    // Coach state (js/coach.js): { placementWpm, placementAccuracy, goalWpm, goalDate, step, fingerMapSeen, dailyGoalWpm }
    'sampire-coach',
];
const CRITICAL_STORAGE_KEYS = [
    LOCAL_AUTH_TOKEN_KEY,
    LOCAL_AUTH_USERS_KEY,
    LOCAL_AUTH_SCORES_KEY,
    LOCAL_GUEST_SCORES_KEY,
    GUEST_LOCATION_CACHE_KEY,
    HISTORY_KEY,
    'sampire-xp',
    'sampire-lifetime-challenges-completed',
    LIFETIME_TESTS_KEY,
    LIFETIME_WORDS_TYPED_KEY,
    LIFETIME_TIME_SECONDS_KEY,
    LIFETIME_BEST_WPM_KEY,
    LIFETIME_BIBLE_TESTS_KEY,
    'sampire-streak',
    'sampire-badges',
    'sampire-daily',
    'sampire-daily-v2',
    'sampire-weekly',
    'sampire-weekly-rival-target',
    'sampire-community-weekly-goal',
    'sampire-community-weekly-contrib',
    'sampire-skill-points',
    'sampire-skills',
    MINING_VISUALS_ENABLED_KEY,
    MINING_LASER_SOUND_ENABLED_KEY,
    BIBLE_MODE_KEY,
];
let authToken = null;
let currentUser = null;
let localApiFallbackActive = false;
let sessionBestWpm = 0;
let activeModalEl = null;
let previousFocusEl = null;
let modalStack = [];
let signupCaptchaAnswer = null;
let progressSyncTimer = null;
let progressSyncInFlight = false;
let suppressProgressSync = false;
let progressCloudUpdatedAt = 0;
let cloudRefreshPromise = null;
let splashPendingAction = null;
let ghostCursorEnabled = true;
let miningVisualsEnabled = false; // effects are off for new players; a saved preference can turn them on
let miningLaserSoundEnabled = true;
let bibleModeEnabled = false;
let bibleModeMissingWarned = false;
let skillStateCache = null;

// ── Engine boot (runs after every declaration above) ───────────────────────
loadEngineOptions();
initEngineOptionsBar();
updateCaretStyleClasses();
applyLiveDisplayOptions();
applyDefaultHint();
if (capsLockBadgeEl) capsLockBadgeEl.hidden = true;
