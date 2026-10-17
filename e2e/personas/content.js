'use strict'
// What people write: reviews, post captions, comments, restaurant posts and promos, in English, Azerbaijani and Russian,
// the way people in Baku mix them. {dish} and {venue} are filled in by the caller's names.

const fill = (s, dish, venue) => s.replace(/\{dish\}/g, dish || '').replace(/\{venue\}/g, venue || '')

/** 'en' | 'az' | 'ru' by the persona's language mix ({ en: .4, az: .5, ru: .1 }). */
function pickLang(rng, mix) {
  const langs = ['en', 'az', 'ru']
  return rng.weighted(langs, l => (mix && mix[l]) || 0) || 'en'
}

/** Mostly 4-5, some 3, rare 2. */
function rating(rng) {
  const r = rng.next()
  return r < 0.46 ? 5 : r < 0.80 ? 4 : r < 0.94 ? 3 : 2
}

// ---- reviews: REVIEWS[lang][stars] --------------------------------------------------------------------------------------------
const REVIEWS = {
  en: {
    5: [
      "Honestly one of the best {dish} I've had in Baku. Hot, fresh and a generous portion.",
      "Loved the {dish}! Service was quick too, we will definitely come back.",
      "{dish} was perfect. Worth every manat.",
      "Came with friends and everybody wanted a bite of the {dish}.",
      "Super tasty and nicely presented. {dish} is a must try here.",
      "Exactly how it should taste. Five stars for the {dish}.",
      "Second time ordering the {dish} and it was just as good as the first.",
    ],
    4: [
      "Really good {dish}, just a bit slow on a busy evening. Would order again.",
      "Tasty and a good portion. The {dish} could use a little more seasoning but I enjoyed it.",
      "Nice {dish}, fair price for the area.",
      "Good food and friendly staff. The {dish} was solid.",
      "Very good, not the best I've had but I would come back for the {dish}.",
      "Enjoyed it. Arrived warm and the portion was fair.",
    ],
    3: [
      "The {dish} was okay. Nothing special and a bit lukewarm when it arrived.",
      "Average. Fine taste but I expected more for the price.",
      "Decent, but nothing I would rush back for.",
      "Portion was small for the price, taste was alright.",
    ],
    2: [
      "Disappointed with the {dish}. It was cold and the wait was long.",
      "Too salty for me and it did not look like the photo.",
      "Waited 35 minutes and the {dish} came out dry. Not again.",
    ],
    beverage: {
      5: ["Perfect {dish}, you can taste that the beans are fresh.", "Best {dish} near the office, smooth and not bitter at all."],
      4: ["Good {dish}, nice cup. A little pricey but worth it."],
    },
    dessert: {
      5: ["The {dish} was the highlight of the evening. Not too sweet, just right.", "{dish} is dangerous, I finished it before my friends could try."],
      4: ["Lovely {dish}, a touch too sweet for me but the texture was great."],
    },
  },
  az: {
    5: [
      "{dish} çox dadlı idi, mütləq yenə gələcəm.",
      "Əla idi! {dish} təzə və isti gəldi, xidmət də sürətli idi.",
      "Bakıda yediyim ən yaxşı {dish}-lərdən biri. Tövsiyə edirəm.",
      "Porsiya böyük, qiymət ədalətli. {dish} üçün 5 ulduz.",
      "Dostlarla getdik, hamı {dish}-i bəyəndi.",
      "Dadı tam yerində idi, əllərinə sağlıq.",
    ],
    4: [
      "Yaxşı idi, sadəcə axşam saatlarında bir az gözlədik. {dish} dadlı idi.",
      "{dish} xoşuma gəldi, bir az da ədviyyat olsaydı daha yaxşı olardı.",
      "Qiymətinə görə yaxşıdır, personal mehribandır.",
      "Dadı yaxşı idi, yenə sifariş verərəm.",
      "Təmiz, rahat məkan. {dish} normal idi, bəyəndim.",
    ],
    3: [
      "Normal idi. {dish} adi idi, xüsusi bir şey yox.",
      "Pis deyildi, amma qiymətə görə daha çox gözləyirdim.",
      "{dish} bir az soyuq gəldi, dadı orta idi.",
    ],
    2: [
      "{dish} duzlu idi və soyuq gəldi, bir daha sifariş verməzdim.",
      "Çox gözlətdilər, yemək də zəif idi.",
    ],
    beverage: {
      5: ["{dish} əla idi, qəhvənin ətri məni heyran etdi.", "Ofisin yanında ən yaxşı {dish}, yumşaq və acı deyil."],
      4: ["{dish} yaxşı idi, bir az bahadır amma dəyər."],
    },
    dessert: {
      5: ["{dish} axşamın ən yaxşı hissəsi idi, çox şirin deyil, tam ölçüsündə.", "{dish} yeyəndən sonra başqa desert istəmədim."],
      4: ["{dish} gözəl idi, mənim üçün bir az şirin oldu."],
    },
  },
  ru: {
    5: [
      "{dish} просто отличный! Горячий, свежий, порция большая.",
      "Очень вкусно, обслуживание быстрое. Обязательно вернёмся.",
      "Один из лучших {dish} в Баку, рекомендую.",
      "Приходили с друзьями, {dish} понравился всем.",
      "Всё идеально, спасибо повару. Пять звёзд.",
    ],
    4: [
      "Хорошо и вкусно, но в час пик пришлось немного подождать.",
      "{dish} вкусный, чуть не хватило специй. В целом доволен.",
      "Достойно за эти деньги, персонал приветливый.",
      "Вкусно, порция нормальная. Закажу ещё.",
    ],
    3: [
      "Нормально, но {dish} был чуть тёплый. Ничего особенного.",
      "Средне. Ожидал большего за такую цену.",
    ],
    2: [
      "{dish} пришёл холодным, ждали долго. Не впечатлило.",
      "Слишком солёно и порция маленькая.",
    ],
    beverage: {
      5: ["{dish} отличный, видно что зёрна свежие.", "Лучший {dish} рядом с офисом, мягкий и без горечи."],
      4: ["Хороший {dish}, немного дороговато, но вкусно."],
    },
    dessert: {
      5: ["{dish} - лучшее, что было за вечер. Не приторно, в самый раз."],
      4: ["Очень хороший {dish}, для меня чуть сладковат."],
    },
  },
}

function reviewText(rng, lang, stars, dish, category) {
  const bank = REVIEWS[lang] || REVIEWS.en
  const special = bank[category === 'beverage' ? 'beverage' : category === 'dessert' ? 'dessert' : '_none']
  const list = special && special[stars] && rng.chance(0.4) ? special[stars] : bank[stars]
  return fill(rng.pick(list), dish)
}

// ---- persona posts (photo posts after a visit) ---------------------------------------------------------------------------------
const POSTS = {
  Aysel: {
    en: ["Sunday lunch at {venue}. The {dish} is why I keep coming back.", "{dish} again, no regrets.", "{venue} never misses. {dish} was perfect tonight.", "Pasta night with the girls. {dish}, obviously."],
    az: ["Bu gün {venue}-də nahar. {dish} həmişə eyni dadlıdır.", "{dish} yenə də əla idi."],
  },
  'Səbinə': {
    az: ["Əvvəl desert, sonra hər şey. {dish} - {venue}.", "Şirniyyat sevənlər üçün: {dish}. {venue}-də yedim.", "Bu {dish} nə gözəldir, baxın!"],
    en: ["Dessert first, always. {dish} at {venue}.", "Sweet tooth satisfied: {dish}."],
  },
  'Könül': {
    az: ["Bu gün {venue}-də {dish} yedim, rəyi də yazdım.", "{venue}: {dish}. Ətraflı rəyim profilimdədir."],
    en: ["Review coming up but first, look at this {dish} from {venue}.", "{venue}: {dish}. Full rating is in my reviews."],
  },
  Kamilla: {
    ru: ["Бранч в {venue}: {dish}, рекомендую!", "Выходные начинаются с кофе и {dish}.", "Бранч с девочками, {dish} и слишком много кофе."],
    en: ["Weekend brunch done right. {dish} at {venue}."],
  },
  Ceyhun: {
    ru: ["{venue} - {dish}. Вот это настоящий вкус.", "Лучший {dish} в городе? Возможно.", "Ужин в {venue}: {dish}, как дома."],
    az: ["Yaxşı mətbəx sevənlər üçün: {dish} @ {venue}.", "{venue}-də {dish}. Dadı yadımda qalıb."],
  },
}
const GENERIC_POSTS = { en: ["{dish} at {venue}. Recommended.", "Tonight: {dish} at {venue}."], az: ["{venue}-də {dish}. Tövsiyə edirəm."], ru: ["{dish} в {venue}. Рекомендую."] }

function postCaption(rng, first, lang, venue, dish) {
  const own = POSTS[first] || {}
  const list = own[lang] || own[Object.keys(own)[0]] || GENERIC_POSTS[lang] || GENERIC_POSTS.en
  return fill(rng.pick(list), dish, venue)
}

// ---- comments from friends ------------------------------------------------------------------------------------------------------
const COMMENTS = {
  en: ["Looks so good!", "Yum, I need to try this", "Take me there next time", "Great choice", "I had this last week, so good", "Now I'm hungry", "Love this place", "Nice shot!", "Saving this for the weekend"],
  az: ["Əla görünür!", "Mütləq getməliyəm", "Məni də apar bir dəfə", "Çox dadlı görünür", "Mən də bunu sevirəm", "Aclığım tutdu", "Növbəti dəfə birlikdə gedək", "Gözəl seçim"],
  ru: ["Выглядит потрясающе!", "Надо попробовать", "Возьми меня с собой в следующий раз", "Вкусно!", "Тоже обожаю это место", "Теперь я голодный", "Отличный выбор"],
}
const REVIEW_COMMENTS = {
  en: ["Agree, same experience here", "Thanks for the tip, I will try it", "Good to know!", "Was there last week, totally agree"],
  az: ["Haqlısan, mən də belə düşünürəm", "Sağ ol, mütləq dadına baxacağam", "Mən də getmişdim, razıyam"],
  ru: ["Согласен, там действительно вкусно", "Спасибо за совет, попробую", "Была на днях, поддерживаю"],
}
const comment = (rng, lang, kind) => rng.pick((kind === 'review' ? REVIEW_COMMENTS : COMMENTS)[lang] || COMMENTS.en)

// ---- restaurant posts (by venue language) ---------------------------------------------------------------------------------------
const VENUE_POSTS = {
  bella:   { dish: ["Fresh from the oven: {dish}. Made the way nonna taught us.", "Today's pick from our kitchen: {dish}. Come hungry."], special: ["Friday is pasta night. Bring your friends and book a table."], event: ["Live acoustic guitar this Saturday from 20:00. Tables fill up early."] },
  seda:    { dish: ["Bu gün mətbəximizdən: {dish}. Ev dadı, təzə və isti.", "{dish} hazırdır! Gəlin, dadına baxın."], special: ["Cümə axşamı ailə axşamıdır: böyük masalar üçün öncədən yer ayırın."], event: ["Şənbə axşamı canlı muğam. Rezerv üçün bizə yazın."] },
  sakura:  { dish: ["Today at the bar: {dish}. Prepared to order, always fresh.", "{dish}: simple, clean, perfect."], special: ["Weekend tasting set, ask your server for the chef's selection."], event: ["Sake and sushi evening on Thursday. Limited seats."] },
  fincan:  { dish: ["Start your day with {dish}. Fresh coffee, warm pastry.", "New in the cup: {dish}. Come and try it before 11."], special: ["Freelancers welcome: wifi, plugs and good coffee until 20:00."], event: ["Cupping session this Saturday at 11:00, free for regulars."] },
  brew:    { dish: ["Brunch is served: {dish}. Pair it with a latte.", "Rainy day, good book, warm {dish}."], special: ["Weekend brunch until 15:00, kitchen open all morning."], event: ["Book club evening this Thursday at 19:00. Coffee is on us for the first ten guests."] },
  doner:   { dish: ["Təzə {dish} hazırdır! Sürətli, doyurucu, dadlı.", "Nahar fasiləsi? {dish} və ayran, 10 dəqiqəyə hazır."], special: ["Ofis sifarişləri üçün yazın, böyük qrupa endirim var."], event: ["Bu həftə sonu yeni souslarımızı sınayın, pulsuz dad."] },
  burger:  { dish: ["Qala burger deyir: {dish} bu gün seçilmiş yeməkdir.", "{dish}: juicy, hot and stacked. Come get it."], special: ["Lunch deal: burger plus a drink, every weekday 12:00-15:00."], event: ["Burger challenge on Saturday. Finish it in 15 minutes and your drinks are free."] },
  shirvan: { dish: ["Şirvan mətbəxindən: {dish}. Ənənəvi resept, ürəkdən hazırlanıb.", "Bu gün {dish} xüsusi təqdimat. Gəlin dadına baxın."], special: ["Plov günü hər bazar günü: qazan plov, təzə qatıq."], event: ["Novruz yaxınlaşır: şəkərbura, paxlava və milli süfrə sifarişləri qəbul edirik."] },
  tiflis:  { dish: ["Сегодня в меню: {dish}. Грузинская кухня как дома.", "{dish} горячий, прямо из печи. Приходите."], special: ["По субботам хачапури по-аджарски со скидкой для компаний."], event: ["В субботу вечер грузинских тостов и живой музыки. Столики лучше заказать заранее."] },
  meze:    { dish: ["The meze table is ready: {dish} and friends. Perfect for sharing.", "Today's tip from the kitchen: {dish}. Fresh and warm."], special: ["Sharing platter for four, ask for the chef's meze selection."], event: ["Live saz music on Saturday evening. Reserve your table."] },
}
function restaurantCaption(rng, venueKey, kind, dish) {
  const bank = VENUE_POSTS[venueKey] || VENUE_POSTS.bella
  return fill(rng.pick(bank[kind] || bank.dish), dish)
}

// ---- promos (ad_campaigns): title, description, type -----------------------------------------------------------------------------
const PROMOS = {
  coffee: [
    { name: 'Morning coffee deal', title: 'Morning coffee, fair price', description: 'Any hot drink with a pastry before 11:00, every weekday.', type: 'discount' },
    { name: 'Weekend brunch', title: 'Brunch all weekend', description: 'Our brunch menu is served until 15:00 on Saturday and Sunday.', type: 'highlight' },
  ],
  quick: [
    { name: 'Lunch combo', title: 'Lunch combo: main plus drink', description: 'Pick any main and a drink from 12:00 to 15:00 and get a better price.', type: 'discount' },
    { name: 'Office orders', title: 'Lunch for the whole office', description: 'Come with 4 or more colleagues and the drinks are on us.', type: 'banner' },
  ],
  restaurant: [
    { name: 'Dish of the week', title: 'Dish of the week', description: 'Our chef picked a favourite for this week. Ask for it at your table.', type: 'highlight' },
    { name: 'Family evenings', title: 'Family dinner evenings', description: 'Book a table for 4 or more and enjoy a free starter to share.', type: 'feed_placement' },
    { name: 'Dessert on us', title: 'Dessert on us', description: 'Order two mains and get a dessert to share.', type: 'discount' },
  ],
}
const promoFor = (rng, kind) => ({ ...rng.pick(PROMOS[kind] || PROMOS.restaurant) })

// ---- booking notes ---------------------------------------------------------------------------------------------------------------------
const NOTES = {
  family: ['Family dinner, one high chair please', 'Ailə şam yeməyi, uşaq kreslosu lazımdır', null],
  group: ['Birthday dinner for a friend', 'Doğum günü, tort gətirəcəyik', 'Girls night out, please a quiet table'],
  couple: ['Window table if possible', 'Anniversary dinner', null, null],
}
const bookingNote = (rng, template) => rng.pick(NOTES[template] || [null])

module.exports = { pickLang, rating, reviewText, postCaption, comment, restaurantCaption, promoFor, bookingNote, VENUE_POSTS }
