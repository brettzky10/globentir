export interface City {
  name: string;
  lat: number;
  lng: number;
  pop: number; // approx population for sizing
}

// Major cities keyed by ISO_A2 country code
// Curated list of large/important cities per country
export const CITIES_BY_COUNTRY: Record<string, City[]> = {
  CA: [
    { name: "Toronto", lat: 43.6532, lng: -79.3832, pop: 2930000 },
    { name: "Montreal", lat: 45.5017, lng: -73.5673, pop: 1762000 },
    { name: "Vancouver", lat: 49.2827, lng: -123.1207, pop: 675218 },
    { name: "Calgary", lat: 51.0447, lng: -114.0719, pop: 1336000 },
    { name: "Edmonton", lat: 53.5461, lng: -113.4938, pop: 981000 },
    { name: "Ottawa", lat: 45.4215, lng: -75.6972, pop: 994837 },
    { name: "Winnipeg", lat: 49.8951, lng: -97.1384, pop: 749607 },
    { name: "Quebec City", lat: 46.8139, lng: -71.2082, pop: 531902 },
    { name: "Hamilton", lat: 43.2557, lng: -79.8711, pop: 536917 },
    { name: "Halifax", lat: 44.6488, lng: -63.5752, pop: 431479 },
    { name: "Saskatoon", lat: 52.1332, lng: -106.6700, pop: 246376 },
    { name: "Regina", lat: 50.4452, lng: -104.6189, pop: 226404 },
    { name: "Victoria", lat: 48.4284, lng: -123.3656, pop: 92141 },
    { name: "Kelowna", lat: 49.8880, lng: -119.4960, pop: 136211 },
    { name: "Whitehorse", lat: 60.7212, lng: -135.0568, pop: 28201 },
  ],
  US: [
    { name: "New York", lat: 40.7128, lng: -74.0060, pop: 8336817 },
    { name: "Los Angeles", lat: 34.0522, lng: -118.2437, pop: 3979576 },
    { name: "Chicago", lat: 41.8781, lng: -87.6298, pop: 2693976 },
    { name: "Houston", lat: 29.7604, lng: -95.3698, pop: 2320268 },
    { name: "Phoenix", lat: 33.4484, lng: -112.0740, pop: 1680992 },
    { name: "Philadelphia", lat: 39.9526, lng: -75.1652, pop: 1584064 },
    { name: "San Antonio", lat: 29.4241, lng: -98.4936, pop: 1434625 },
    { name: "San Diego", lat: 32.7157, lng: -117.1611, pop: 1386932 },
    { name: "Dallas", lat: 32.7767, lng: -96.7970, pop: 1304379 },
    { name: "San Jose", lat: 37.3382, lng: -121.8863, pop: 1013240 },
    { name: "Seattle", lat: 47.6062, lng: -122.3321, pop: 737255 },
    { name: "Denver", lat: 39.7392, lng: -104.9903, pop: 715522 },
    { name: "Miami", lat: 25.7617, lng: -80.1918, pop: 467963 },
    { name: "Atlanta", lat: 33.7490, lng: -84.3880, pop: 506811 },
    { name: "Boston", lat: 42.3601, lng: -71.0589, pop: 692600 },
  ],
  GB: [
    { name: "London", lat: 51.5074, lng: -0.1278, pop: 8982000 },
    { name: "Birmingham", lat: 52.4862, lng: -1.8904, pop: 1141816 },
    { name: "Manchester", lat: 53.4808, lng: -2.2426, pop: 553230 },
    { name: "Glasgow", lat: 55.8642, lng: -4.2518, pop: 635640 },
    { name: "Liverpool", lat: 53.4084, lng: -2.9916, pop: 498042 },
    { name: "Edinburgh", lat: 55.9533, lng: -3.1883, pop: 524930 },
    { name: "Leeds", lat: 53.8008, lng: -1.5491, pop: 790834 },
    { name: "Bristol", lat: 51.4545, lng: -2.5879, pop: 467099 },
  ],
  FR: [
    { name: "Paris", lat: 48.8566, lng: 2.3522, pop: 2161000 },
    { name: "Marseille", lat: 43.2965, lng: 5.3698, pop: 870731 },
    { name: "Lyon", lat: 45.7640, lng: 4.8357, pop: 522969 },
    { name: "Toulouse", lat: 43.6047, lng: 1.4442, pop: 479553 },
    { name: "Nice", lat: 43.7102, lng: 7.2620, pop: 342669 },
    { name: "Bordeaux", lat: 44.8378, lng: -0.5792, pop: 257804 },
  ],
  DE: [
    { name: "Berlin", lat: 52.5200, lng: 13.4050, pop: 3769495 },
    { name: "Hamburg", lat: 53.5753, lng: 10.0153, pop: 1841179 },
    { name: "Munich", lat: 48.1351, lng: 11.5820, pop: 1471508 },
    { name: "Cologne", lat: 50.9333, lng: 6.9500, pop: 1083498 },
    { name: "Frankfurt", lat: 50.1109, lng: 8.6821, pop: 763380 },
    { name: "Stuttgart", lat: 48.7758, lng: 9.1829, pop: 634830 },
  ],
  AU: [
    { name: "Sydney", lat: -33.8688, lng: 151.2093, pop: 5312000 },
    { name: "Melbourne", lat: -37.8136, lng: 144.9631, pop: 5078000 },
    { name: "Brisbane", lat: -27.4698, lng: 153.0251, pop: 2560000 },
    { name: "Perth", lat: -31.9505, lng: 115.8605, pop: 2085000 },
    { name: "Adelaide", lat: -34.9285, lng: 138.6007, pop: 1402393 },
    { name: "Canberra", lat: -35.2809, lng: 149.1300, pop: 462213 },
    { name: "Darwin", lat: -12.4634, lng: 130.8456, pop: 147255 },
  ],
  JP: [
    { name: "Tokyo", lat: 35.6762, lng: 139.6503, pop: 13960000 },
    { name: "Osaka", lat: 34.6937, lng: 135.5023, pop: 2691185 },
    { name: "Nagoya", lat: 35.1815, lng: 136.9066, pop: 2283289 },
    { name: "Sapporo", lat: 43.0618, lng: 141.3545, pop: 1952356 },
    { name: "Fukuoka", lat: 33.5904, lng: 130.4017, pop: 1612392 },
    { name: "Kyoto", lat: 35.0116, lng: 135.7681, pop: 1468000 },
    { name: "Kobe", lat: 34.6901, lng: 135.1956, pop: 1537272 },
  ],
  CN: [
    { name: "Shanghai", lat: 31.2304, lng: 121.4737, pop: 24281000 },
    { name: "Beijing", lat: 39.9042, lng: 116.4074, pop: 21707000 },
    { name: "Chongqing", lat: 29.5630, lng: 106.5516, pop: 14838000 },
    { name: "Guangzhou", lat: 23.1291, lng: 113.2644, pop: 13501100 },
    { name: "Shenzhen", lat: 22.5431, lng: 114.0579, pop: 12530000 },
    { name: "Chengdu", lat: 30.5728, lng: 104.0668, pop: 9000000 },
    { name: "Tianjin", lat: 39.3434, lng: 117.3616, pop: 13215000 },
    { name: "Wuhan", lat: 30.5928, lng: 114.3055, pop: 8266000 },
  ],
  IN: [
    { name: "Mumbai", lat: 19.0760, lng: 72.8777, pop: 20667656 },
    { name: "Delhi", lat: 28.7041, lng: 77.1025, pop: 32941309 },
    { name: "Bangalore", lat: 12.9716, lng: 77.5946, pop: 12765000 },
    { name: "Hyderabad", lat: 17.3850, lng: 78.4867, pop: 9482000 },
    { name: "Chennai", lat: 13.0827, lng: 80.2707, pop: 8653521 },
    { name: "Kolkata", lat: 22.5726, lng: 88.3639, pop: 14850000 },
    { name: "Pune", lat: 18.5204, lng: 73.8567, pop: 6629000 },
    { name: "Ahmedabad", lat: 23.0225, lng: 72.5714, pop: 7650000 },
  ],
  BR: [
    { name: "São Paulo", lat: -23.5505, lng: -46.6333, pop: 22429800 },
    { name: "Rio de Janeiro", lat: -22.9068, lng: -43.1729, pop: 13634274 },
    { name: "Brasília", lat: -15.7942, lng: -47.8825, pop: 3094325 },
    { name: "Salvador", lat: -12.9714, lng: -38.5014, pop: 2954333 },
    { name: "Fortaleza", lat: -3.7172, lng: -38.5434, pop: 2686612 },
    { name: "Belo Horizonte", lat: -19.9167, lng: -43.9345, pop: 2722000 },
    { name: "Manaus", lat: -3.1190, lng: -60.0217, pop: 2255903 },
  ],
  RU: [
    { name: "Moscow", lat: 55.7558, lng: 37.6173, pop: 12506468 },
    { name: "Saint Petersburg", lat: 59.9311, lng: 30.3609, pop: 5281579 },
    { name: "Novosibirsk", lat: 54.9884, lng: 82.9357, pop: 1625631 },
    { name: "Yekaterinburg", lat: 56.8389, lng: 60.6057, pop: 1493749 },
    { name: "Kazan", lat: 55.7887, lng: 49.1221, pop: 1231878 },
    { name: "Chelyabinsk", lat: 55.1644, lng: 61.4368, pop: 1196680 },
    { name: "Vladivostok", lat: 43.1056, lng: 131.8735, pop: 604901 },
  ],
  MX: [
    { name: "Mexico City", lat: 19.4326, lng: -99.1332, pop: 9209944 },
    { name: "Guadalajara", lat: 20.6597, lng: -103.3496, pop: 1495182 },
    { name: "Monterrey", lat: 25.6866, lng: -100.3161, pop: 1142652 },
    { name: "Puebla", lat: 19.0414, lng: -98.2063, pop: 1576259 },
    { name: "Tijuana", lat: 32.5027, lng: -117.0037, pop: 1922523 },
    { name: "Cancun", lat: 21.1619, lng: -86.8515, pop: 888797 },
  ],
  ZA: [
    { name: "Johannesburg", lat: -26.2041, lng: 28.0473, pop: 5635127 },
    { name: "Cape Town", lat: -33.9249, lng: 18.4241, pop: 4618000 },
    { name: "Durban", lat: -29.8587, lng: 31.0218, pop: 3720000 },
    { name: "Pretoria", lat: -25.7479, lng: 28.2293, pop: 2921488 },
    { name: "Port Elizabeth", lat: -33.9608, lng: 25.6022, pop: 1152115 },
  ],
  AR: [
    { name: "Buenos Aires", lat: -34.6037, lng: -58.3816, pop: 15369919 },
    { name: "Córdoba", lat: -31.4201, lng: -64.1888, pop: 1391000 },
    { name: "Rosario", lat: -32.9468, lng: -60.6393, pop: 1193605 },
    { name: "Mendoza", lat: -32.8895, lng: -68.8458, pop: 1055679 },
  ],
  NG: [
    { name: "Lagos", lat: 6.5244, lng: 3.3792, pop: 14862111 },
    { name: "Kano", lat: 12.0022, lng: 8.5920, pop: 3626068 },
    { name: "Ibadan", lat: 7.3775, lng: 3.9470, pop: 3649000 },
    { name: "Abuja", lat: 9.0765, lng: 7.3986, pop: 3464000 },
    { name: "Port Harcourt", lat: 4.8156, lng: 7.0498, pop: 1865000 },
  ],
  EG: [
    { name: "Cairo", lat: 30.0444, lng: 31.2357, pop: 20900604 },
    { name: "Alexandria", lat: 31.2001, lng: 29.9187, pop: 5200000 },
    { name: "Giza", lat: 30.0131, lng: 31.2089, pop: 3628062 },
  ],
  SA: [
    { name: "Riyadh", lat: 24.7136, lng: 46.6753, pop: 7231447 },
    { name: "Jeddah", lat: 21.5433, lng: 39.1728, pop: 4697000 },
    { name: "Mecca", lat: 21.3891, lng: 39.8579, pop: 1675368 },
    { name: "Medina", lat: 24.5247, lng: 39.5692, pop: 1300000 },
  ],
  TR: [
    { name: "Istanbul", lat: 41.0082, lng: 28.9784, pop: 15519267 },
    { name: "Ankara", lat: 39.9334, lng: 32.8597, pop: 5663322 },
    { name: "Izmir", lat: 38.4192, lng: 27.1287, pop: 4320519 },
  ],
  ID: [
    { name: "Jakarta", lat: -6.2088, lng: 106.8456, pop: 10562088 },
    { name: "Surabaya", lat: -7.2504, lng: 112.7688, pop: 2874699 },
    { name: "Bandung", lat: -6.9175, lng: 107.6191, pop: 2575478 },
    { name: "Bali", lat: -8.3405, lng: 115.0920, pop: 4320300 },
  ],
  KR: [
    { name: "Seoul", lat: 37.5665, lng: 126.9780, pop: 9720846 },
    { name: "Busan", lat: 35.1796, lng: 129.0756, pop: 3448737 },
    { name: "Incheon", lat: 37.4563, lng: 126.7052, pop: 2954642 },
  ],
  IT: [
    { name: "Rome", lat: 41.9028, lng: 12.4964, pop: 2872800 },
    { name: "Milan", lat: 45.4654, lng: 9.1859, pop: 1397715 },
    { name: "Naples", lat: 40.8518, lng: 14.2681, pop: 962003 },
    { name: "Turin", lat: 45.0703, lng: 7.6869, pop: 870456 },
    { name: "Palermo", lat: 38.1157, lng: 13.3615, pop: 676118 },
  ],
  ES: [
    { name: "Madrid", lat: 40.4168, lng: -3.7038, pop: 3305408 },
    { name: "Barcelona", lat: 41.3851, lng: 2.1734, pop: 1620343 },
    { name: "Valencia", lat: 39.4699, lng: -0.3763, pop: 810064 },
    { name: "Seville", lat: 37.3891, lng: -5.9845, pop: 688711 },
    { name: "Zaragoza", lat: 41.6488, lng: -0.8891, pop: 681003 },
  ],
  PL: [
    { name: "Warsaw", lat: 52.2297, lng: 21.0122, pop: 1790658 },
    { name: "Kraków", lat: 50.0647, lng: 19.9450, pop: 779966 },
    { name: "Łódź", lat: 51.7592, lng: 19.4560, pop: 672185 },
  ],
  UA: [
    { name: "Kyiv", lat: 50.4501, lng: 30.5234, pop: 2967360 },
    { name: "Kharkiv", lat: 49.9935, lng: 36.2304, pop: 1433886 },
    { name: "Odesa", lat: 46.4825, lng: 30.7233, pop: 1015826 },
  ],
  NL: [
    { name: "Amsterdam", lat: 52.3676, lng: 4.9041, pop: 872680 },
    { name: "Rotterdam", lat: 51.9244, lng: 4.4777, pop: 651446 },
    { name: "The Hague", lat: 52.0705, lng: 4.3007, pop: 547757 },
  ],
  SE: [
    { name: "Stockholm", lat: 59.3293, lng: 18.0686, pop: 975551 },
    { name: "Gothenburg", lat: 57.7089, lng: 11.9746, pop: 579281 },
    { name: "Malmö", lat: 55.6059, lng: 13.0007, pop: 347949 },
  ],
  NO: [
    { name: "Oslo", lat: 59.9139, lng: 10.7522, pop: 693494 },
    { name: "Bergen", lat: 60.3913, lng: 5.3221, pop: 285911 },
  ],
  PK: [
    { name: "Karachi", lat: 24.8607, lng: 67.0011, pop: 14916456 },
    { name: "Lahore", lat: 31.5204, lng: 74.3587, pop: 13095038 },
    { name: "Islamabad", lat: 33.6844, lng: 73.0479, pop: 1014825 },
    { name: "Faisalabad", lat: 31.4187, lng: 73.0791, pop: 3640000 },
  ],
  BD: [
    { name: "Dhaka", lat: 23.8103, lng: 90.4125, pop: 21741091 },
    { name: "Chittagong", lat: 22.3569, lng: 91.7832, pop: 2800000 },
  ],
  PH: [
    { name: "Manila", lat: 14.5995, lng: 120.9842, pop: 1846513 },
    { name: "Quezon City", lat: 14.6760, lng: 121.0437, pop: 2936116 },
    { name: "Cebu", lat: 10.3157, lng: 123.8854, pop: 964169 },
    { name: "Davao", lat: 7.1907, lng: 125.4553, pop: 1776949 },
  ],
  VN: [
    { name: "Ho Chi Minh City", lat: 10.8231, lng: 106.6297, pop: 9077158 },
    { name: "Hanoi", lat: 21.0285, lng: 105.8542, pop: 8053663 },
    { name: "Da Nang", lat: 16.0471, lng: 108.2068, pop: 1134310 },
  ],
  TH: [
    { name: "Bangkok", lat: 13.7563, lng: 100.5018, pop: 10539415 },
    { name: "Chiang Mai", lat: 18.7883, lng: 98.9853, pop: 150000 },
  ],
  MM: [
    { name: "Yangon", lat: 16.8661, lng: 96.1951, pop: 7410000 },
    { name: "Mandalay", lat: 21.9588, lng: 96.0891, pop: 1225553 },
    { name: "Naypyidaw", lat: 19.7633, lng: 96.0785, pop: 924608 },
  ],
  MY: [
    { name: "Kuala Lumpur", lat: 3.1390, lng: 101.6869, pop: 1768000 },
    { name: "George Town", lat: 5.4141, lng: 100.3288, pop: 1745000 },
    { name: "Johor Bahru", lat: 1.4927, lng: 103.7414, pop: 1638000 },
  ],
  IR: [
    { name: "Tehran", lat: 35.6892, lng: 51.3890, pop: 9259000 },
    { name: "Mashhad", lat: 36.2605, lng: 59.6168, pop: 3372660 },
    { name: "Isfahan", lat: 32.6546, lng: 51.6680, pop: 2220000 },
  ],
  IQ: [
    { name: "Baghdad", lat: 33.3152, lng: 44.3661, pop: 7216040 },
    { name: "Basra", lat: 30.5085, lng: 47.7804, pop: 2750000 },
    { name: "Mosul", lat: 36.3350, lng: 43.1189, pop: 1694000 },
  ],
  AF: [
    { name: "Kabul", lat: 34.5553, lng: 69.2075, pop: 4601789 },
    { name: "Kandahar", lat: 31.6129, lng: 65.7372, pop: 614118 },
  ],
  ET: [
    { name: "Addis Ababa", lat: 9.1450, lng: 40.4897, pop: 3352000 },
    { name: "Dire Dawa", lat: 9.5930, lng: 41.8661, pop: 473690 },
  ],
  KE: [
    { name: "Nairobi", lat: -1.2921, lng: 36.8219, pop: 4397073 },
    { name: "Mombasa", lat: -4.0435, lng: 39.6682, pop: 1208333 },
  ],
  TZ: [
    { name: "Dar es Salaam", lat: -6.7924, lng: 39.2083, pop: 6048000 },
    { name: "Dodoma", lat: -6.1722, lng: 35.7395, pop: 410956 },
  ],
  GH: [
    { name: "Accra", lat: 5.5560, lng: -0.1969, pop: 4193690 },
    { name: "Kumasi", lat: 6.6884, lng: -1.6244, pop: 3179647 },
  ],
  MA: [
    { name: "Casablanca", lat: 33.5731, lng: -7.5898, pop: 3752468 },
    { name: "Rabat", lat: 34.0209, lng: -6.8416, pop: 577827 },
    { name: "Fez", lat: 34.0181, lng: -5.0078, pop: 1112072 },
    { name: "Marrakech", lat: 31.6295, lng: -7.9811, pop: 928850 },
  ],
  DZ: [
    { name: "Algiers", lat: 36.7372, lng: 3.0865, pop: 3415811 },
    { name: "Oran", lat: 35.6969, lng: -0.6331, pop: 1454078 },
  ],
  PE: [
    { name: "Lima", lat: -12.0464, lng: -77.0428, pop: 10883756 },
    { name: "Arequipa", lat: -16.4090, lng: -71.5375, pop: 1008290 },
    { name: "Trujillo", lat: -8.1159, lng: -79.0300, pop: 919899 },
  ],
  CO: [
    { name: "Bogotá", lat: 4.7110, lng: -74.0721, pop: 7181469 },
    { name: "Medellín", lat: 6.2518, lng: -75.5636, pop: 2569674 },
    { name: "Cali", lat: 3.4516, lng: -76.5320, pop: 2471474 },
    { name: "Barranquilla", lat: 10.9685, lng: -74.7813, pop: 1386865 },
  ],
  VE: [
    { name: "Caracas", lat: 10.4806, lng: -66.9036, pop: 2082040 },
    { name: "Maracaibo", lat: 10.6544, lng: -71.6402, pop: 2658355 },
  ],
  CL: [
    { name: "Santiago", lat: -33.4489, lng: -70.6693, pop: 7112808 },
    { name: "Valparaíso", lat: -33.0472, lng: -71.6127, pop: 284630 },
  ],
  CH: [
    { name: "Zurich", lat: 47.3769, lng: 8.5417, pop: 421878 },
    { name: "Geneva", lat: 46.2044, lng: 6.1432, pop: 201818 },
    { name: "Basel", lat: 47.5596, lng: 7.5886, pop: 178120 },
  ],
  AT: [
    { name: "Vienna", lat: 48.2082, lng: 16.3738, pop: 1911191 },
    { name: "Graz", lat: 47.0707, lng: 15.4395, pop: 328276 },
    { name: "Linz", lat: 48.3069, lng: 14.2858, pop: 205891 },
  ],
  BE: [
    { name: "Brussels", lat: 50.8503, lng: 4.3517, pop: 1208542 },
    { name: "Antwerp", lat: 51.2194, lng: 4.4025, pop: 529247 },
    { name: "Ghent", lat: 51.0543, lng: 3.7174, pop: 263927 },
  ],
  CZ: [
    { name: "Prague", lat: 50.0755, lng: 14.4378, pop: 1324277 },
    { name: "Brno", lat: 49.1951, lng: 16.6068, pop: 381346 },
  ],
  HU: [
    { name: "Budapest", lat: 47.4979, lng: 19.0402, pop: 1752000 },
    { name: "Debrecen", lat: 47.5316, lng: 21.6273, pop: 201432 },
  ],
  RO: [
    { name: "Bucharest", lat: 44.4268, lng: 26.1025, pop: 1883425 },
    { name: "Cluj-Napoca", lat: 46.7712, lng: 23.6236, pop: 324576 },
  ],
  GR: [
    { name: "Athens", lat: 37.9838, lng: 23.7275, pop: 3154591 },
    { name: "Thessaloniki", lat: 40.6401, lng: 22.9444, pop: 1114000 },
  ],
  PT: [
    { name: "Lisbon", lat: 38.7223, lng: -9.1393, pop: 505526 },
    { name: "Porto", lat: 41.1579, lng: -8.6291, pop: 237559 },
  ],
  NZ: [
    { name: "Auckland", lat: -36.8485, lng: 174.7633, pop: 1700000 },
    { name: "Wellington", lat: -41.2865, lng: 174.7762, pop: 215100 },
    { name: "Christchurch", lat: -43.5321, lng: 172.6362, pop: 369100 },
  ],
  IL: [
    { name: "Tel Aviv", lat: 32.0853, lng: 34.7818, pop: 460613 },
    { name: "Jerusalem", lat: 31.7683, lng: 35.2137, pop: 936425 },
    { name: "Haifa", lat: 32.7940, lng: 34.9896, pop: 285316 },
  ],
  AE: [
    { name: "Dubai", lat: 25.2048, lng: 55.2708, pop: 3331420 },
    { name: "Abu Dhabi", lat: 24.4539, lng: 54.3773, pop: 1483000 },
    { name: "Sharjah", lat: 25.3573, lng: 55.4033, pop: 1274749 },
  ],
  SG: [
    { name: "Singapore", lat: 1.3521, lng: 103.8198, pop: 5850000 },
  ],
};

/**
 * Get cities for a country, filtered to show the most prominent ones.
 * Returns at most `limit` cities, largest population first.
 */
export function getCitiesForCountry(isoA2: string, limit = 12): City[] {
  const cities = CITIES_BY_COUNTRY[isoA2] ?? [];
  return [...cities].sort((a, b) => b.pop - a.pop).slice(0, limit);
}
