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

const WORD_LIST = [
    'about','above','across','after','again','against','age','ago','air','all',
    'along','already','also','always','among','animal','answer','any','appear',
    'area','around','back','be','because','before','begin','behind','below','best',
    'better','between','big','bird','black','blue','body','book','both','bring',
    'build','busy','call','came','can','car','care','carry','center','change',
    'check','city','clear','close','cold','color','come','common','could','country',
    'course','cover','cut','day','decide','deep','do','dog','door','down','draw',
    'drive','during','each','early','earth','east','eat','end','enough','even',
    'ever','every','face','fall','family','far','fast','father','feel','feet',
    'fill','final','find','fine','fire','first','five','follow','food','foot',
    'force','form','found','four','free','from','front','full','game','get',
    'girl','give','go','gold','good','great','green','ground','grow','half',
    'hand','happen','hard','have','head','hear','heavy','help','her','here',
    'high','him','hold','home','hot','hour','house','how','hundred','idea',
    'into','island','it','its','just','keep','know','land','language','large',
    'last','late','laugh','lay','learn','leave','left','let','life','light',
    'like','line','list','live','long','look','love','make','man','map','mark',
    'mile','minute','miss','money','moon','most','mother','mountain','move','much',
    'music','my','name','near','need','never','new','next','night','no','north',
    'nothing','now','number','object','ocean','off','often','old','once','only',
    'open','or','other','our','out','over','own','page','part','pass','people',
    'person','picture','place','plane','plant','play','possible','power','press',
    'problem','provide','pull','push','put','quick','rain','reach','read','real',
    'record','red','right','river','road','rock','rule','run','same','say','school',
    'sea','second','seem','serve','set','several','shape','ship','short','show',
    'side','since','slow','small','snow','so','some','song','soon','south','space',
    'spell','stand','start','state','stay','step','still','stop','story','street',
    'strong','study','sun','surface','system','take','talk','teach','tell','than',
    'their','them','then','there','think','this','thought','three','time','together',
    'top','toward','town','tree','true','try','turn','two','under','until','up',
    'use','voice','walk','want','war','watch','way','week','well','west','what',
    'wheel','when','where','which','white','who','whole','wind','without','wonder',
    'word','work','world','would','year','young','your','able','act','add','age',
    'aim','arm','ask','bad','bag','ban','bar','bat','bay','bed','bit','box','boy',
    'bus','buy','cry','cup','dad','die','dig','dim','dry','due','dug','dye','ear',
    'egg','era','eye','fan','fat','few','fix','fly','fog','fun','gap','gas','gun',
    'gut','gym','hat','hay','hit','hop','hug','hum','hunt','ice','ill','ink','inn',
    'ivy','jab','jar','jaw','jet','job','joy','key','kid','kit','lab','lap','led',
    'leg','lid','lip','log','lot','low','mad','man','map','mat','mix','mob','mod',
    'mud','mug','nap','net','nod','nor','odd','oil','old','opt','orb','pad','pan',
    'pat','pay','pen','pet','pin','pit','pop','pot','raw','ray','rid','rim','rip',
    'rob','rot','row','rub','rug','sad','sag','sat','saw','say','set','sew','shy',
    'sin','sip','sir','sit','six','ski','sky','sly','sob','son','sow','soy','spa',
    'spy','sum','tab','tan','tap','tar','tax','tea','ten','tip','toe','ton','too',
    'top','toy','tug','tux','van','vat','via','vow','wax','web','wed','win','wit',
    'woe','wok','won','woo','yes','yet','zip','zoo','able','aged','airy','also',
    'avid','awry','bald','bare','base','bash','bask','bath','bead','beam','bean',
    'bear','beat','been','bell','belt','bend','bias','bind','bite','blob','bold',
    'bolt','bond','bone','boom','boot','bore','born','boss','bowl','brag','bran',
    'bray','bred','brew','brow','buck','buff','bulb','bull','bump','burn','burp',
    'buzz','cage','cake','calm','camp','cane','cape','card','cast','cave','cell',
    'chad','chef','chew','chin','chip','chop','chug','clam','clap','claw','clay',
    'clip','clop','clue','coal','coat','coil','coin','cook','cool','cope','cord',
    'cork','corn','cost','cozy','crab','crew','crop','crow','crud','cube','curl',
    'damp','dare','dark','dart','dash','dawn','daze','dead','deal','dean','dear',
    'debt','deck','deed','deem','deft','dell','dent','deny','desk','dial','dice',
    'dine','dire','disk','dive','dock','dome','done','dorm','dose','dote','dove',
    'drab','drag','drip','drop','drum','dual','duel','dumb','dump','dune','dusk',
    'dust','each','earn','ease','edge','edit','emit','envy','epic','even','exam',
    'exit','expo','fade','fail','fair','fake','fame','fare','farm','fast','fate',
    'fawn','faze','feat','feed','feel','fell','felt','fend','fern','fess','fete',
    'feud','fib','field','fife','film','fist','fizz','flag','flap','flat','flaw',
    'fled','flex','flip','flit','flop','flow','flue','foam','fold','fond','font',
    'ford','fore','fork','foul','fowl','fray','free','fret','frog','from','fume',
    'furl','fuse','fuss','gale','gall','gash','gasp','gaze','gear','gild','gilt',
    'gist','glad','glow','glum','gnat','goad','golf','gore','gosh','gown','grab',
    'gram','grin','grip','grit','grog','grub','gust','gutter','hack','hail','hale',
    'hall','halt','harm','harp','hash','haul','heal','heap','heat','heel','helm',
    'hemp','herd','hewn','hike','hill','hilt','hint','hire','hive','hoax','hoist',
    'hole','hood','hook','hope','horn','hose','host','howl','hulk','hull','hurl',
    'husk','idle','inch','iris','iron','isle','itch','item','jade','jail','jamb',
    'jerk','jest','jolt','junk','just','keen','kept','kern','kill','kiln','kind',
    'kink','knot','lack','laid','lame','lamp','lark','lash','lass','last','laud',
    'lawn','lazy','lead','leaf','leak','lean','leap','lend','lens','lick','lien',
    'lieu','lift','limb','lime','limp','link','lion','loft','lone','loom','loon',
    'lore','lorn','lout','lull','lump','lure','lurk','lush','lust','mace','made',
    'mail','main','male','mall','malt','mane','mare','mars','mast','maze','mead',
    'meal','mean','meat','melt','memo','mend','mere','mesh','mild','mill','mime',
    'mire','mist','moan','moat','molt','monk','mood','moor','more','mote','much',
    'mull','murk','must','mute','myth','nail','nape','nave','navy','neat','neck',
    'need','nest','newt','next','nice','nick','nigh','nill','node','noon','norm',
    'nose','note','null','numb','oath','obey','once','only','ooze','oral','orca',
    'oven','pace','pack','pact','pain','pair','pale','pall','palm','pane','pave',
    'peak','peal','pear','peat','peel','peen','peer','pelt','perk','pest','pick',
    'pier','pile','pine','pink','pipe','pity','plod','plop','plot','plow','ploy',
    'plum','plus','poke','pole','poll','pond','pore','pork','port','pose','post',
    'pout','pray','prey','prim','prod','prom','prop','prose','puff','pure','purr',
    'quit','race','rack','rage','raid','rail','rake','ramp','rang','rank','rant',
    'rash','rate','rave','raze','reek','reel','rein','rely','rend','rent','rest',
    'rice','rich','ride','rife','rift','ring','rink','riot','rise','risk','rite',
    'roam','roar','robe','rode','role','roll','romp','roof','rook','rope','rose',
    'rout','rove','ruin','rush','rust','sage','sail','sake','sale','salt','same',
    'sand','sang','sank','sash','save','scan','scar','seam','seer','self','sell',
    'send','sent','shed','shin','shot','shun','silk','silt','sink','slab','slag',
    'slap','slam','slat','slim','slip','slit','slob','slog','slop','slot','slug',
    'slum','slur','smug','snap','snob','snub','soak','soar','sock','soft','soil',
    'sole','some','sort','soul','span','spar','spin','spit','spot','spud','spur',
    'stab','stag','stem','stew','stir','stub','such','sulk','surf','swam','swap',
    'swat','sway','swim','swum','sync','tack','tame','tang','taut','tell','tend',
    'tent','term','text','then','thin','tide','tied','tier','till','tilt','time',
    'tint','tire','toad','toil','toll','tomb','tong','tort','toss','tout','town',
    'tram','trap','trim','trio','trip','trod','trot','tube','tuft','turf','twig',
    'twin','type','ugly','undo','unit','upon','urge','vale','vane','vast','veil',
    'vein','vent','verb','very','vest','veto','view','vine','void','volt','wade',
    'wail','wake','wane','warp','wart','wave','weak','wean','weld','went','wept',
    'whim','whip','whiz','wick','wide','wile','will','wily','wimp','wink','wire',
    'wise','wish','wisp','with','woke','wolf','womb','wore','worm','worn','wrap',
    'wren','writ','yawn','yelp','your','zeal','zest','zinc',
];

function generateWord() {
    return WORD_LIST[Math.floor(Math.random() * WORD_LIST.length)];
}

// ── Mode ───────────────────────────────────────────────────────────────────
let currentMode = 'words';
const RANDOM_WORDS_DURATION = 30;
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
    if (mode === 'words')  return 'words';
    return 'words 30s';
}

function getPrimaryNewTestLabel(mode = currentMode) {
    if (mode === 'community') return 'New Mission';
    if (mode !== 'quotes') return 'New Words';
    return bibleModeEnabled ? 'New Verse' : 'New Quote';
}

function updatePrimaryNewTestButtons() {
    const label = getPrimaryNewTestLabel(currentMode);
    document.querySelectorAll('.new-test-btn').forEach((btn) => {
        btn.innerHTML = escapeHtml(label) + '<span class="btn-hint">(Spacebar)</span>';
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
    const panel = document.getElementById('challenge-panel');
    const area  = document.getElementById('typing-area');
    if (mode === 'daily') {
        clearInterval(timerHandle);
        timerHandle = null;
        startTime = null;
        isComplete = false;
        resultsPendingOpen = false;
        if (sfxReady && previousMode !== 'daily') playSound(SFX.changeMode);
        if (panel) panel.style.display = 'block';
        if (area)  area.style.display  = 'none';
        clearMiningLaserOverlay();
        renderDailyChallenges();
    } else {
        if (panel) panel.style.display = 'none';
        if (area)  area.style.display  = '';
        updateChallengeHint();
        newTest(true);
    }
}

function generateWordTest(count = 40) {
    const words = [];
    for (let i = 0; i < count; i++) words.push(generateWord());
    return words.join(' ');
}

function generateTargetedWeaknessPassage(count = 60) {
    const xzWords = WORD_LIST.filter((w) => /[xz]/i.test(w));
    const pool = xzWords.length > 0 ? xzWords : ['xenon', 'zodiac', 'matrix', 'horizon', 'zenith'];
    const words = [];
    for (let i = 0; i < count; i++) {
        if (i % 6 === 0) words.push(pool[Math.floor(Math.random() * pool.length)]);
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

function newTest(fromModeSwitch = false) {
    if (sfxReady) playSound(fromModeSwitch ? SFX.changeMode : SFX.newTest);
    pendingGhostChars = null;
    pendingGhostTimeline = null;
    // Load persistent PB ghost for word modes
    if (!activeChallengeId && (currentMode === 'words' || currentMode === 'words30')) {
        try {
            const stored = localStorage.getItem('sampire-ghost-' + currentMode);
            if (stored) pendingGhostTimeline = JSON.parse(stored);
        } catch(e) {}
    }
    communityModeRuntime = buildCommunityModeRuntime();
    if (activeChallengeId === 'sprint') {
        init(generateWordTest(120), 'Challenge: The Sprint \u2022 30s \u2022 100 WPM');
    } else if (activeChallengeId === 'nobackspace') {
        init(generateWordTest(100), `Challenge: No Backspace \u2022 100 words \u2022 ${NO_BACKSPACE_MIN_ACC}% accuracy`);
    } else if (activeChallengeId === 'perfectionist') {
        const short = QUOTES.filter(q => q.text.trim().split(/\s+/).length >= 20 && q.text.trim().split(/\s+/).length <= 30);
        const pool = short.length > 0 ? short : QUOTES;
        const q = pool[Math.floor(Math.random() * pool.length)];
        init(q.text, `Challenge: The Perfectionist \u2022 ${q.source}`);
    } else if (currentMode === 'community') {
        const def = getCommunityBoostDefinition();
        if (!def) {
            init(generateWordTest(), '');
        } else if (def.id === 'targeted_weakness') {
            init(generateTargetedWeaknessPassage(65), 'Community Mode \u2022 Targeted Weakness');
        } else if (def.id === 'kinetic_shielding') {
            const baseline = Number(communityModeRuntime && communityModeRuntime.baselineWpm) || 35;
            init(generateWordTest(120), `Community Mode \u2022 Kinetic Shielding \u2022 Hold above ${baseline} WPM`);
        } else {
            init(generateWordTest(), '');
        }
    } else if (currentMode === 'quotes') {
        const useTargetedPassage = activeCommunityBoostMode === 'targeted_weakness';
        const pool = getQuotePool();
        const q = pool[Math.floor(Math.random() * pool.length)];
        try {
            const gk = 'sampire-ghost-quotes-' + btoa(encodeURIComponent(q.text)).slice(0, 40);
            const stored = localStorage.getItem(gk);
            if (stored) pendingGhostTimeline = JSON.parse(stored);
        } catch(e) {}
        if (useTargetedPassage) {
            init(generateTargetedWeaknessPassage(65), 'Community Mode: Targeted Weakness');
        } else {
            init(q.text, q.source);
        }
    } else if (currentMode === 'adaptive') {
        const drill = window.AdaptivePractice
            ? AdaptivePractice.generateDrill({ wordCount: 40, wordPool: WORD_LIST })
            : '';
        const weak = window.AdaptivePractice ? AdaptivePractice.getWeakKeys(3) : [];
        const weakLabel = weak.length
            ? 'Focus: ' + weak.map(w => (w && (w.char || w.key)) || w).join(', ')
            : 'Calibrating: keep typing to find your weak keys';
        init(drill || generateWordTest(), `Adaptive Practice \u2022 ${weakLabel}`);
    } else if (currentMode === 'words30') {
        if (activeCommunityBoostMode === 'kinetic_shielding') {
            const baseline = Number(communityModeRuntime && communityModeRuntime.baselineWpm) || 35;
            init(generateWordTest(120), `Community Mode: Kinetic Shielding \u2022 Hold above ${baseline} WPM`);
        } else {
            init(generateWordTest(120), `Random words sprint \u2022 ${RANDOM_WORDS_DURATION}s`);
        }
    } else {
        init(generateWordTest(), '');
    }
    updateCommunityModePopup();
}

// ── State ──────────────────────────────────────────────────────────────────
let currentQuote       = '';
let currentQuoteSource = '';
let typedChars         = [];
let currentIndex  = 0;
let startTime     = null;
let timerHandle   = null;
let isComplete    = false;
let resultsPendingOpen = false;
let wpmSamples    = [];   // [{t: seconds, wpm: number}, ...]
let lastSampleSec = -1;
let keyStrokes    = 0;
let backspaces    = 0;
let mistakeCount  = 0;
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
let activeAuraWordIndex = -1;

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

function updateGhostToggleButton() {
    const btn = document.getElementById('ghost-toggle-btn');
    if (!btn) return;
    btn.textContent = `Ghost Cursor: ${ghostCursorEnabled ? 'On' : 'Off'}`;
    btn.classList.toggle('toggle-on', ghostCursorEnabled);
}

function updateMiningLaserSoundToggleButton() {
    const btn = document.getElementById('mining-fx-sfx-toggle-btn');
    const lyraBtn = document.getElementById('lyra-story-sfx-toggle');
    if (btn) {
        btn.textContent = miningLaserSoundEnabled ? '🔊' : '🔇';
        btn.classList.toggle('on', miningLaserSoundEnabled);
        btn.classList.toggle('muted', !miningLaserSoundEnabled);
        btn.setAttribute('aria-label', miningLaserSoundEnabled ? 'Mute laser sounds' : 'Enable laser sounds');
        btn.title = miningLaserSoundEnabled ? 'Mute laser sounds' : 'Enable laser sounds';
        btn.style.display = miningVisualsEnabled ? 'inline-flex' : 'none';
    }
    if (lyraBtn) {
        lyraBtn.textContent = miningLaserSoundEnabled ? '🔊' : '🔇';
        lyraBtn.classList.toggle('muted', !miningLaserSoundEnabled);
        lyraBtn.setAttribute('aria-label', miningLaserSoundEnabled ? 'Mute mining sound effects' : 'Enable mining sound effects');
        lyraBtn.title = miningLaserSoundEnabled ? 'Mute mining sound effects' : 'Enable mining sound effects';
    }
}

function updateMiningFxToggleButton() {
    const btn = document.getElementById('mining-fx-toggle-btn');
    if (!btn) return;
    btn.textContent = `Mining FX: ${miningVisualsEnabled ? 'On' : 'Off'}`;
    btn.classList.toggle('toggle-on', miningVisualsEnabled);
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

function toggleMiningLaserSound() {
    miningLaserSoundEnabled = !miningLaserSoundEnabled;
    try { localStorage.setItem(MINING_LASER_SOUND_ENABLED_KEY, miningLaserSoundEnabled ? '1' : '0'); } catch (e) {}
    updateMiningLaserSoundToggleButton();
}

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
const HIDDEN_INPUT_SENTINEL = '\u200B';
let keydownHandledInput = false; // set when keydown already consumed a printable key
function resetHiddenInput() {
    hiddenInput.value = HIDDEN_INPUT_SENTINEL;
    try { hiddenInput.setSelectionRange(HIDDEN_INPUT_SENTINEL.length, HIDDEN_INPUT_SENTINEL.length); } catch (e) {}
}
const TYPED_CHAR_MAP = {
    '\u2018': "'", '\u2019': "'", '\u201A': "'", '\u201B': "'",
    '\u201C': '"', '\u201D': '"', '\u201E': '"', '\u201F': '"',
    '\u2013': '-', '\u2014': '-', '\u2212': '-',
    '\u2026': '.', '\u00A0': ' ', '\u202F': ' ', '\u2009': ' ',
};
// Single char in, single char out (an ellipsis is treated as '.')
function normalizeTypedChar(ch) {
    const c = String(ch == null ? '' : ch);
    return Object.prototype.hasOwnProperty.call(TYPED_CHAR_MAP, c) ? TYPED_CHAR_MAP[c] : c;
}
function stripCharAccents(ch) {
    return ch.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
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
const progressEl        = document.getElementById('progress');
const hintEl            = document.getElementById('hint');
const resultOverlay     = document.getElementById('result-overlay');
const chartCanvas       = document.getElementById('wpm-chart');
const chartCanvasResult = document.getElementById('wpm-chart-result');
const miningLaserOverlay = document.getElementById('mining-laser-overlay');
const miningLaserShip = document.getElementById('mining-laser-ship');

// ── Core logic ─────────────────────────────────────────────────────────────
function clearChart(canvas) {
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function drawIdleLiveChart() {
    // Render a static baseline so the live graph is visible before typing starts.
    drawLineChart(chartCanvas, [{ t: 0, wpm: 0 }, { t: 5, wpm: 0 }]);
}

function init(quote, source = '') {
    currentQuote       = quote;
    currentQuoteSource = source;
    typedChars   = [];
    currentIndex = 0;
    startTime    = null;
    isComplete   = false;
    resultsPendingOpen = false;
    ghostChars   = Array.isArray(pendingGhostChars) ? pendingGhostChars.slice() : [];
    ghostTimeline = Array.isArray(pendingGhostTimeline) ? pendingGhostTimeline.slice() : [];
    adaptiveLastKeyAt = 0;
    if (window.RunAnalysis) RunAnalysis.ghostDelta.reset();
    ghostReplayIndex = (ghostCursorEnabled && ghostTimeline.length > 0) ? ghostTimeline[0].index : -1;
    attemptTimeline = [];
    pendingGhostChars = null;
    pendingGhostTimeline = null;

    clearInterval(timerHandle);
    timerHandle = null;

    wpmEl.textContent      = '0';
    accuracyEl.textContent = '—';
    timerEl.textContent    = isTimedMode() ? `${RANDOM_WORDS_DURATION}s` : '0s';
    progressEl.style.width = '0%';

    wpmSamples    = [];
    lastSampleSec = -1;
    keyStrokes    = 0;
    backspaces    = 0;
    mistakeCount  = 0;
    clearChart(chartCanvas);
    clearChart(chartCanvasResult);
    requestAnimationFrame(drawIdleLiveChart);
    chartCanvasResult.style.display = 'none';

    resultOverlay.classList.remove('show');
    hintEl.classList.add('visible');

    // Update source attribution line
    const sourceEl = document.getElementById('quote-source');
    if (sourceEl) sourceEl.textContent = source;

    updateTypingViewportMode(true);
    renderQuote();
    focusInput();
}

function restart() {
    playSound(SFX.restartTest);
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
    init(currentQuote, currentQuoteSource);
}

function tryAgain() {
    playSound(SFX.tryAgain);
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
    init(currentQuote, currentQuoteSource);
}

function extendWordBuffer() {
    if (!isTimedMode()) return;
    if (currentQuote.length - currentIndex > 40) return;
    currentQuote += ' ' + generateWordTest(RANDOM_WORDS_BUFFER_WORDS);
}

function focusInput() {
    resetHiddenInput();
    try {
        hiddenInput.focus({ preventScroll: true });
    } catch (e) {
        hiddenInput.focus();
    }
    quoteDisplay.classList.add('focused');
    // On touch devices, scroll the quote display into view after keyboard opens
    if (matchMedia('(pointer: coarse)').matches) {
        setTimeout(() => {
            quoteDisplay.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 300);
    }
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

function syncTypingViewportScroll(resetScroll = false) {
    if (!quoteDisplay) return;
    if (!quoteDisplay.classList.contains('words30-compact')) {
        if (resetScroll || quoteDisplay.scrollLeft !== 0) quoteDisplay.scrollLeft = 0;
        return;
    }
    if (!charSpans.length) {
        quoteDisplay.scrollLeft = 0;
        return;
    }
    const anchorIndex = Math.max(0, Math.min(currentIndex, charSpans.length - 1));
    const anchor = charSpans[anchorIndex];
    if (!anchor) return;
    const maxScroll = Math.max(0, quoteDisplay.scrollWidth - quoteDisplay.clientWidth);
    const leadSpace = Math.max(72, quoteDisplay.clientWidth * 0.28);
    const target = Math.max(0, Math.min(maxScroll, anchor.offsetLeft - leadSpace));
    quoteDisplay.scrollLeft = target;
}

window.addEventListener('resize', () => {
    syncTypingViewportScroll(false);
    updateMiningLaserAtActiveWord();
    if (isLyraGateOpen()) updateLyraShipAim();
});

// ── Rendering ──────────────────────────────────────────────────────────────
function makeCharSpan(i) {
    const ch   = currentQuote[i];
    const span = document.createElement('span');
    span.textContent = ch === ' ' ? '\u00A0' : ch;
    if (i < currentIndex) {
        span.className = (typedChars[i] === ch) ? 'char-correct' : 'char-incorrect';
    } else if (i === currentIndex) {
        span.className = 'char-cursor';
    } else {
        span.className = 'char-untyped';
        if (ghostCursorEnabled && ghostChars[i] !== undefined) {
            span.classList.add(ghostChars[i] === ch ? 'char-ghost-correct' : 'char-ghost-incorrect');
        }
        if (ghostCursorEnabled && i === ghostReplayIndex && i !== currentIndex) {
            span.classList.add('char-ghost-cursor');
        }
    }
    return span;
}

function renderQuote() {
    charSpans = [];
    wordSpans = [];
    wordRanges = [];
    activeAuraWordIndex = -1;
    quoteDisplay.innerHTML = '';
    let i = 0;
    while (i < currentQuote.length) {
        if (currentQuote[i] === ' ') {
            const sp = makeCharSpan(i);
            charSpans.push(sp);
            quoteDisplay.appendChild(sp);
            i++;
        } else {
            const wordSpan = document.createElement('span');
            wordSpan.className = 'quote-word';
            wordSpan.style.whiteSpace = 'nowrap';
            const start = i;
            while (i < currentQuote.length && currentQuote[i] !== ' ') {
                const sp = makeCharSpan(i);
                charSpans.push(sp);
                wordSpan.appendChild(sp);
                i++;
            }
            wordRanges.push({ start, end: i });
            wordSpans.push(wordSpan);
            quoteDisplay.appendChild(wordSpan);
        }
    }
    applyAuraStyles();
    // Re-append the mobile tap hint (cleared by innerHTML = '')
    const tapHint = document.getElementById('mobile-tap-hint') || (() => {
        const d = document.createElement('div');
        d.className = 'mobile-tap-hint';
        d.id = 'mobile-tap-hint';
        d.textContent = 'Tap here to start typing';
        return d;
    })();
    quoteDisplay.appendChild(tapHint);
    syncTypingViewportScroll(true);
    updateMiningLaserAtActiveWord();
}

// Update a single character span in-place — avoids full DOM rebuild per keystroke.
function updateCharSpan(i) {
    if (i < 0 || i >= charSpans.length) return;
    const span = charSpans[i];
    const ch = currentQuote[i];
    if (i < currentIndex) {
        span.className = (typedChars[i] === ch) ? 'char-correct' : 'char-incorrect';
    } else if (i === currentIndex) {
        span.className = 'char-cursor';
    } else {
        span.className = 'char-untyped';
        if (ghostCursorEnabled && ghostChars[i] !== undefined) {
            span.classList.add(ghostChars[i] === ch ? 'char-ghost-correct' : 'char-ghost-incorrect');
        }
        if (ghostCursorEnabled && i === ghostReplayIndex && i !== currentIndex) {
            span.classList.add('char-ghost-cursor');
        }
    }
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

    for (let i = 0; i < wordRanges.length; i++) {
        const range = wordRanges[i];
        if (idx >= range.start && idx < range.end) return i;
    }
    return -1;
}

function getWordIndexForChar(charIndex) {
    if (!wordRanges.length) return -1;
    const idx = Math.max(0, Math.min(currentQuote.length - 1, Number(charIndex) || 0));
    for (let i = 0; i < wordRanges.length; i++) {
        const range = wordRanges[i];
        if (idx >= range.start && idx < range.end) return i;
    }
    return -1;
}

function emitMiningShatterAtWord(wordIndex) {
    if (!miningVisualsEnabled) return;
    if (!quoteDisplay || !wordSpans.length) return;
    if (wordIndex < 0 || wordIndex >= wordSpans.length) return;
    const wordEl = wordSpans[wordIndex];
    if (!wordEl) return;

    const hostRect = quoteDisplay.getBoundingClientRect();
    const wordRect = wordEl.getBoundingClientRect();
    const centerX = wordRect.left - hostRect.left + (wordRect.width * 0.5);
    const centerY = wordRect.top - hostRect.top + (wordRect.height * 0.58);
    const burstCount = 18;
    const palette = ['#fde047', '#fb923c', '#f97316', '#ef4444', '#facc15'];

    const core = document.createElement('span');
    core.className = 'mining-shatter-core';
    core.style.setProperty('--x', `${centerX.toFixed(1)}px`);
    core.style.setProperty('--y', `${centerY.toFixed(1)}px`);
    quoteDisplay.appendChild(core);
    core.addEventListener('animationend', () => core.remove(), { once: true });

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

        quoteDisplay.appendChild(p);
        p.addEventListener('animationend', () => p.remove(), { once: true });
    }
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

function getMiningLaserGeometry(anchorEl = null) {
    if (!miningLaserOverlay) return null;
    const typingArea = document.getElementById('typing-area');
    if (!miningVisualsEnabled || !typingArea || typingArea.style.display === 'none' || !quoteDisplay || !charSpans.length || quoteDisplay.offsetParent === null) return null;

    const anchor = anchorEl || getMiningLaserAnchorElement();
    if (!anchor) return null;

    const rect = anchor.getBoundingClientRect();
    const targetX = rect.left + (rect.width * 0.5);
    const targetY = rect.top + (rect.height * 0.58);
    const quoteRect = quoteDisplay.getBoundingClientRect();
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

function updateMiningLaserAtActiveWord() {
    if (!miningLaserOverlay) return;
    if (!miningVisualsEnabled || !startTime || isComplete) {
        clearMiningLaserOverlay();
        return;
    }
    if (miningLaserShip && !miningLaserShip.firstElementChild) {
        miningLaserShip.innerHTML = getCommunityShipSprite('player');
    }
    const g = getMiningLaserGeometry();
    if (!g) {
        clearMiningLaserOverlay();
        return;
    }
    miningLaserOverlay.style.setProperty('--laser-origin-x', `${g.originX.toFixed(1)}px`);
    miningLaserOverlay.style.setProperty('--ship-bottom', `${g.shipBottom.toFixed(1)}px`);
    miningLaserOverlay.style.setProperty('--ship-angle', `${g.shipAngle.toFixed(2)}deg`);
    miningLaserOverlay.classList.add('show');
}

function emitMiningLaserShotAtWord(typedIndex = null) {
    if (!miningVisualsEnabled || !miningLaserOverlay) return;
    if (miningLaserShip && !miningLaserShip.firstElementChild) {
        miningLaserShip.innerHTML = getCommunityShipSprite('player');
    }
    const anchorEl = getMiningLaserAnchorElement(Number.isFinite(typedIndex) ? typedIndex : null);
    const g = getMiningLaserGeometry(anchorEl);
    if (!g) return;

    miningLaserOverlay.style.setProperty('--laser-origin-x', `${g.originX.toFixed(1)}px`);
    miningLaserOverlay.style.setProperty('--ship-bottom', `${g.shipBottom.toFixed(1)}px`);
    miningLaserOverlay.style.setProperty('--ship-angle', `${g.shipAngle.toFixed(2)}deg`);
    miningLaserOverlay.classList.add('show');

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
    miningLaserOverlay.style.setProperty('--laser-origin-x', `${ox.toFixed(1)}px`);
    miningLaserOverlay.style.setProperty('--ship-bottom', `${shipBottom.toFixed(1)}px`);
    miningLaserOverlay.style.setProperty('--ship-angle', `${shipAngle.toFixed(2)}deg`);
    miningLaserOverlay.classList.add('show');

    const shot = document.createElement('span');
    shot.className = 'mining-laser-shot';
    shot.style.setProperty('--shot-origin-x', `${ox.toFixed(1)}px`);
    shot.style.setProperty('--shot-origin-y', `${originYFromBottom.toFixed(1)}px`);
    shot.style.setProperty('--shot-length', `${length.toFixed(1)}px`);
    shot.style.setProperty('--shot-angle', `${angleDeg.toFixed(2)}deg`);
    shot.style.setProperty('--shot-hue', String(hue));
    shot.style.setProperty('--shot-width', `${beamWidth}px`);

    const core = document.createElement('span');
    core.className = 'mining-laser-shot-core';
    core.style.setProperty('--shot-origin-x', `${ox.toFixed(1)}px`);
    core.style.setProperty('--shot-origin-y', `${originYFromBottom.toFixed(1)}px`);
    core.style.setProperty('--shot-length', `${length.toFixed(1)}px`);
    core.style.setProperty('--shot-angle', `${angleDeg.toFixed(2)}deg`);
    core.style.setProperty('--shot-hue', String(hue));
    core.style.setProperty('--shot-core-width', `${coreWidth}px`);

    miningLaserOverlay.appendChild(shot);
    miningLaserOverlay.appendChild(core);
    shot.addEventListener('animationend', () => shot.remove(), { once: true });
    core.addEventListener('animationend', () => core.remove(), { once: true });
}

function applyAuraStyles() {
    for (let i = 0; i < wordSpans.length; i++) {
        wordSpans[i].classList.remove('word-aura-active');
    }
    activeAuraWordIndex = -1;
    if (!isRewardActive('aura')) return;

    const targetWordIndex = getCurrentWordIndex();
    if (targetWordIndex < 0 || targetWordIndex >= wordSpans.length) return;

    const wpm = getWPM(getElapsed());
    const speedRatio = Math.max(0, Math.min(1, wpm / 140));
    const hue = Math.round(215 - speedRatio * 95);
    const alpha = (0.18 + speedRatio * 0.2).toFixed(3);
    const ringAlpha = (0.38 + speedRatio * 0.3).toFixed(3);
    quoteDisplay.style.setProperty('--aura-bg', `hsla(${hue}, 88%, 62%, ${alpha})`);
    quoteDisplay.style.setProperty('--aura-ring', `hsla(${hue}, 92%, 67%, ${ringAlpha})`);
    quoteDisplay.style.setProperty('--aura-glow', `hsla(${hue}, 96%, 72%, ${alpha})`);

    wordSpans[targetWordIndex].classList.add('word-aura-active');
    activeAuraWordIndex = targetWordIndex;
}

function emitNebulaTrailAtCursor(force = false) {
    if (!force && !isRewardActive('nebulaTrail')) return;
    if (!quoteDisplay || !charSpans.length) return;

    const anchorIndex = Math.max(0, Math.min(currentIndex, charSpans.length - 1));
    const anchor = charSpans[anchorIndex];
    if (!anchor) return;

    const hostRect = quoteDisplay.getBoundingClientRect();
    const anchorRect = anchor.getBoundingClientRect();
    const baseX = anchorRect.left - hostRect.left + (anchorRect.width * 0.5);
    const baseY = anchorRect.top - hostRect.top + (anchorRect.height * 0.56);

    const particleCount = 3;
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

        quoteDisplay.appendChild(p);
        p.addEventListener('animationend', () => p.remove(), { once: true });
    }
}

function emitXzLaserAtCursor(keyChar) {
    if (activeCommunityBoostMode !== 'targeted_weakness' || currentMode !== 'community') return;
    if (!quoteDisplay || !charSpans.length) return;
    const lower = String(keyChar || '').toLowerCase();
    if (lower !== 'x' && lower !== 'z') return;

    const anchorIndex = Math.max(0, Math.min(currentIndex - 1, charSpans.length - 1));
    const anchor = charSpans[anchorIndex];
    if (!anchor) return;

    const hostRect = quoteDisplay.getBoundingClientRect();
    const anchorRect = anchor.getBoundingClientRect();
    const laser = document.createElement('span');
    laser.className = 'xz-laser-icon';
    laser.textContent = '✦';
    laser.style.left = `${anchorRect.left - hostRect.left + (anchorRect.width * 0.5)}px`;
    laser.style.top = `${anchorRect.top - hostRect.top + (anchorRect.height * 0.55)}px`;
    quoteDisplay.appendChild(laser);
    laser.addEventListener('animationend', () => laser.remove(), { once: true });
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
    return startTime ? (Date.now() - startTime) / 1000 : 0;
}

function getWPM(elapsed) {
    if (!elapsed) return 0;
    let correct = 0;
    for (let i = 0; i < currentIndex; i++)
        if (typedChars[i] === currentQuote[i]) correct++;
    return Math.round((correct / 5) / (elapsed / 60));
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

function getConsistency() {
    const values = wpmSamples.map(s => s.wpm).filter(v => v > 0);
    if (values.length < 2) return 100;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    if (mean <= 0) return 100;
    const variance = values.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / values.length;
    const stdev = Math.sqrt(variance);
    const cv = stdev / mean;
    return Math.max(0, Math.min(100, Math.round(100 - cv * 100)));
}

function updateStats() {
    const elapsed  = getElapsed();
    const acc = getAccuracy();
    wpmEl.textContent      = elapsed >= 1 ? getWPM(elapsed) : 0;
    accuracyEl.textContent = acc !== null ? acc + '%' : '—';
    const progress = isTimedMode()
        ? Math.min(100, (elapsed / RANDOM_WORDS_DURATION) * 100)
        : (currentIndex / currentQuote.length * 100);
    progressEl.style.width = progress + '%';
    applyAuraStyles();
    updateMiningLaserAtActiveWord();
}

// ── WPM Chart ──────────────────────────────────────────────────────────────
function drawLineChart(canvas, samples) {
    if (samples.length < 2) return;

    const dpr  = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const cssW = rect.width;
    const cssH = rect.height;
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

    const maxWpm = Math.max(...samples.map(s => s.wpm), 10);
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

    const yStep = yMax <= 40 ? 10 : yMax <= 80 ? 20 : 30;
    for (let w = 0; w <= yMax; w += yStep) {
        const y = toY(w);
        ctx.beginPath();
        ctx.moveTo(PAD.left, y);
        ctx.lineTo(PAD.left + drawW, y);
        ctx.stroke();
        ctx.fillText(w, PAD.left - 5, y + 3.5);
    }

    // ── X labels ──
    const xStep = xMax <= 10 ? 1 : xMax <= 30 ? 5 : 10;
    ctx.textAlign = 'center';
    for (let t = 0; t <= xMax; t += xStep) {
        ctx.fillText(t + 's', toX(t), PAD.top + drawH + 18);
    }

    // ── Gradient fill ──
    const grad = ctx.createLinearGradient(0, PAD.top, 0, PAD.top + drawH);
    grad.addColorStop(0, 'rgba(124,111,247,0.35)');
    grad.addColorStop(1, 'rgba(124,111,247,0)');

    ctx.beginPath();
    ctx.moveTo(toX(samples[0].t), toY(samples[0].wpm));
    for (let i = 1; i < samples.length; i++) {
        const p0 = samples[Math.max(i - 2, 0)];
        const p1 = samples[i - 1];
        const p2 = samples[i];
        const p3 = samples[Math.min(i + 1, samples.length - 1)];
        const cp1x = toX(p1.t)   + (toX(p2.t)   - toX(p0.t))   / 6;
        const cp1y = toY(p1.wpm) + (toY(p2.wpm) - toY(p0.wpm)) / 6;
        const cp2x = toX(p2.t)   - (toX(p3.t)   - toX(p1.t))   / 6;
        const cp2y = toY(p2.wpm) - (toY(p3.wpm) - toY(p1.wpm)) / 6;
        ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, toX(p2.t), toY(p2.wpm));
    }
    ctx.lineTo(toX(samples[samples.length - 1].t), toY(0));
    ctx.lineTo(toX(samples[0].t), toY(0));
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // ── Line ──
    ctx.beginPath();
    ctx.moveTo(toX(samples[0].t), toY(samples[0].wpm));
    for (let i = 1; i < samples.length; i++) {
        const p0 = samples[Math.max(i - 2, 0)];
        const p1 = samples[i - 1];
        const p2 = samples[i];
        const p3 = samples[Math.min(i + 1, samples.length - 1)];
        const cp1x = toX(p1.t)   + (toX(p2.t)   - toX(p0.t))   / 6;
        const cp1y = toY(p1.wpm) + (toY(p2.wpm) - toY(p0.wpm)) / 6;
        const cp2x = toX(p2.t)   - (toX(p3.t)   - toX(p1.t))   / 6;
        const cp2y = toY(p2.wpm) - (toY(p3.wpm) - toY(p1.wpm)) / 6;
        ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, toX(p2.t), toY(p2.wpm));
    }
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
}

function sampleWpm() {
    const elapsed = getElapsed();
    const sec     = Math.floor(elapsed);
    if (sec >= 1 && sec > lastSampleSec) {
        lastSampleSec = sec;
        wpmSamples.push({ t: sec, wpm: getWPM(elapsed) });
    }
}

function updateLiveChart() {
    if (wpmSamples.length < 2) return;
    drawLineChart(chartCanvas, wpmSamples);
}

function drawResultChart() {
    if (wpmSamples.length < 2) return;
    chartCanvasResult.style.display = 'block';
    requestAnimationFrame(() => drawLineChart(chartCanvasResult, wpmSamples));
}

function startTimer() {
    startTime   = Date.now();
    attemptTimeline = [{ t: 0, index: 0 }];
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
                if (charSpans.length === currentQuote.length) {
                    updateCharSpan(oldGhost);   // remove ghost cursor class
                    updateCharSpan(nextGhost);  // add ghost cursor class
                } else {
                    renderQuote();
                }
            }
        }

        if (isTimedMode() && elapsed >= RANDOM_WORDS_DURATION) {
            isComplete = true;
            resultsPendingOpen = true;
            clearInterval(timerHandle);
            timerHandle = null;
            timerEl.textContent = '0s';
            setTimeout(() => { if (resultsPendingOpen) showResults(); }, 120);
        }
    }, 150);
}

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
    'sampire-community-weekly-goal',
    'sampire-community-weekly-contrib',
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
let miningVisualsEnabled = true;
let miningLaserSoundEnabled = true;
let bibleModeEnabled = false;
let bibleModeMissingWarned = false;
let skillStateCache = null;
