// Forecast point of each province = its capital town (28 Oct 2026). The geometric province centre used
// before often fell on a mountain: Xaignabouli's sat at 1,847 m and read ~10 °C colder than the town.
// Coordinates checked against OpenStreetMap (reverse geocoding lands in the named town) and Open-Meteo's
// elevation model. Phongsali, Phonsavan, Xam Neua and Anouvong really are high towns.
export const TOWNS={
 'phongsaly':{town:'ຜົ້ງສາລີ',lat:21.6833,lon:102.1000},
 'luang-namtha':{town:'ຫຼວງນ້ຳທາ',lat:20.9500,lon:101.4000},
 'oudomxay':{town:'ໄຊ',lat:20.6930,lon:101.9854},
 'bokeo':{town:'ຫ້ວຍຊາຍ',lat:20.2775,lon:100.4128},
 'luang-prabang':{town:'ຫຼວງພະບາງ',lat:19.8887,lon:102.1359},
 'houaphan':{town:'ຊຳເໜືອ',lat:20.4152,lon:104.0474},
 'xaignabouli':{town:'ໄຊຍະບູລີ',lat:19.2500,lon:101.7500},
 'xiangkhouang':{town:'ໂພນສະຫວັນ',lat:19.4500,lon:103.1833},
 'vientiane-capital':{town:'ວຽງຈັນ',lat:17.9667,lon:102.6000},
 'vientiane':{town:'ໂພນໂຮງ',lat:18.4936,lon:102.4128},
 'xaisomboun':{town:'ອະນຸວົງ',lat:18.8977,lon:103.0925},
 'bolikhamsai':{town:'ປາກຊັນ',lat:18.3924,lon:103.6593},
 'khammouane':{town:'ທ່າແຂກ',lat:17.3946,lon:104.8065},
 'savannakhet':{town:'ໄກສອນ ພົມວິຫານ',lat:16.5567,lon:104.7528},
 'salavan':{town:'ສາລະວັນ',lat:15.7167,lon:106.4167},
 'xekong':{town:'ລະມາມ',lat:15.3470,lon:106.7230},
 'champasak':{town:'ປາກເຊ',lat:15.1202,lon:105.7990},
 'attapeu':{town:'ສາມັກຄີໄຊ',lat:14.8000,lon:106.8333}};
// [lat, lon] for a province slug; falls back to the given centre ([lon, lat]) for an unknown slug.
export const forecastPoint=(slug,center)=>TOWNS[slug]?[TOWNS[slug].lat,TOWNS[slug].lon]:[center[1],center[0]];
