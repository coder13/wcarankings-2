export const MOCK_RANKING_COUNT = 100_000;
export const MOCK_RANKING_ROW_HEIGHT = 65.45;

const names = [
  "Teodor Zajder",
  "Xuanyi Geng (耿暄一)",
  "Yiheng Wang (王艺衡)",
  "Max Park",
  "Qixian Cao (曹岂娴)",
  "Ruihang Xu (许瑞航)",
  "Zhen Chen (陈震)",
  "Ryan Pilat",
  "Yufang Du (杜昱方)",
  "Bofan Zhang (张博藩)",
  "Zhaokun Li (李昭昆)",
  "Luke Garrett",
  "Aaron Huynh",
  "Yusheng Du (杜宇生)",
  "Hansen Yu (余翰森)",
  "Tymon Kolasiński",
  "Timofei Tarasenko",
  "Matty Hiroto Inaba",
  "Yunzhi Lian (连允之)",
  "Yi Shen (沈懿)",
  "Dylan Miller",
  "Aidan Grainger",
  "Max Siauw",
  "Caleb Chen",
  "Claudio Matias Cancino Bruna",
  "Riley Dexter",
  "Daniel Rush",
  "Brenton Angelo Lo Wong",
  "Olaf Kuźmiński",
  "Yize Dong (董一泽)",
  "Jode Brewster",
  "Asher Kim-Magierek",
  "Divyaansh Khatri (दिव्यांश खत्री)",
  "Jake Brown",
  "Alexey Tsvetkov",
  "Radosław Marcinek",
  "Luke Griesser",
  "Yaqian Xu (徐雅芊)",
  "Natthaphat Mahtani (ณัฐภัทร จี มาทานี)",
  "Jerry Yao",
  "Ryan Tan",
  "Theo Goluboff",
  "Carson Widjaja",
  "Tee Kai Yang",
  "Ianis Costin Chele",
  "Sebastian Stone",
  "Lingkun Jiang (姜凌坤)",
  "Tian Xia (夏天)",
  "Sean Patrick Villanueva",
  "Feliks Zemdegs",
  "Zijian Cai (蔡子健)",
  "Arhaan Sareen",
  "Caio Hideaki Sato",
  "Luokun Chen (陈洛琨)",
  "Phoenix Patterson",
  "Sameer Aggarwal",
  "Xi Chen (陈曦)",
  "Brennen Lin",
  "Christopher Sun",
  "Juan Miguel Y. Magallanes",
  "Leo Borromeo",
  "Brendyn Dunagan",
  "Kai-Wen Wang (王楷文)",
  "Kim Roger Haraldsen",
  "Oliwier Szubert",
  "Siddharth Reddy",
  "Patrick Ponce",
  "Seung Hyuk Nahm (남승혁)",
  "Shuda Huang (黄黍达)",
  "Ziyu Ye (叶梓渝)",
  "Brian Johnson",
  "Ayden Dincher",
  "Agustín Mera Landa",
  "Asset Agabekov",
  "Kaichen Huang (黄楷宸)",
  "Magdalena Pabisz",
  "Chyngyz Sultanbekov (Чынгыз Султанбеков)",
  "CJ Furey",
  "Kyle Santucci",
  "Valerio Locatelli",
  "Serban Stelian",
  "Dávid Szabó",
  "Toby Seufert",
  "Yifan Luo (骆奕帆)",
  "James Alonso",
  "Dominic Redisi",
  "Juan Miguel Saboya Soto",
  "Lim Hung (林弘)",
  "Nancy Liu",
  "Sebastian Weyer",
  "Wei Liu (刘蔚)",
  "Ciarán Beahan",
  "Handi Huang (黄翰迪)",
  "Ludwig Ivarsson",
  "Andrey Che",
  "Muhammad Faeyza Koda",
  "Zeke Mackay",
  "David Epstein",
  "Zhiyi Yang (杨芝懿)",
  "Firstian Fushada (符逢城)",
] as const;

function formatCentiseconds(centiseconds: number) {
  const minutes = Math.floor(centiseconds / 6_000);
  const remainingCentiseconds = centiseconds % 6_000;
  const seconds = Math.floor(remainingCentiseconds / 100);
  const hundredths = remainingCentiseconds % 100;

  if (minutes === 0) return `${seconds}.${hundredths.toString().padStart(2, "0")}`;
  return `${minutes}:${seconds.toString().padStart(2, "0")}.${hundredths
    .toString()
    .padStart(2, "0")}`;
}

export function getMockRanking(index: number) {
  const number = index + 1;
  const centiseconds = 276 + Math.round((index * 162) / 99);

  return {
    number,
    name: names[index % names.length],
    result: formatCentiseconds(centiseconds),
  };
}
