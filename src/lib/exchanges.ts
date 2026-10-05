// The building shown through the loading screen's mosaic for each exchange, keyed by Yahoo's
// exchange codes. Photos are from Wikimedia Commons (credits below and in
// public/images/exchanges/CREDITS.md).

export interface ExchangePhoto {
  /** Short name shown on the loading screen, e.g. NASDAQ */
  label: string;
  /** Photo path under public/ */
  src: string;
  /** Focal point for the crop (CSS background-position) */
  focus: string;
}

const NYSE: ExchangePhoto = { label: "NYSE", src: "/images/exchanges/nyse.jpg", focus: "50% 45%" };
const NASDAQ: ExchangePhoto = { label: "NASDAQ", src: "/images/exchanges/nasdaq.jpg", focus: "45% 40%" };
const TSX: ExchangePhoto = { label: "TSX", src: "/images/exchanges/tsx.jpg", focus: "50% 50%" };
const LSE: ExchangePhoto = { label: "LSE", src: "/images/exchanges/lse.jpg", focus: "45% 50%" };
const WALL_ST: ExchangePhoto = { label: "WALL ST", src: "/images/exchanges/wallst.jpg", focus: "55% 45%" };

const BY_CODE: Record<string, ExchangePhoto> = {
  // Nasdaq Global Select / Global / Capital markets
  NMS: NASDAQ,
  NGM: NASDAQ,
  NCM: NASDAQ,
  NAS: NASDAQ,
  NIM: NASDAQ,
  // NYSE and its American / Arca markets (the same building at 11 Wall Street)
  NYQ: NYSE,
  NYS: NYSE,
  ASE: { ...NYSE, label: "NYSE AMERICAN" },
  PCX: { ...NYSE, label: "NYSE ARCA" },
  // Toronto and London
  TOR: TSX,
  VAN: { ...TSX, label: "TSXV" },
  LSE: LSE,
  IOB: LSE,
  // Cboe and the OTC markets have no landmark building of their own
  BTS: { ...WALL_ST, label: "CBOE" },
  PNK: { ...WALL_ST, label: "OTC" },
  OQB: { ...WALL_ST, label: "OTC" },
  OQX: { ...WALL_ST, label: "OTC" },
  OEM: { ...WALL_ST, label: "OTC" },
};

/** Photo for an exchange code; Wall Street for anything without its own. */
export function exchangePhoto(code: string | null | undefined, name?: string | null): ExchangePhoto {
  const known = code ? BY_CODE[code.toUpperCase()] : undefined;
  if (known) return known;
  return { ...WALL_ST, label: (name || code || "MARKET").toUpperCase().slice(0, 14) };
}

/** Preload the photo so the reveal never waits on the network. */
export function preloadExchangePhoto(photo: ExchangePhoto) {
  const img = new Image();
  img.src = photo.src;
}

export const PHOTO_CREDITS = [
  { file: "nyse.jpg", title: "New York Stock Exchange (2024)", author: "颐园居", license: "CC BY-SA 4.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/", url: "https://commons.wikimedia.org/wiki/File:NEW_YORK_STOCK_EXCHANGE_20240521.jpg" },
  { file: "nasdaq.jpg", title: "Nasdaq MarketSite", author: "ajay_suresh", license: "CC BY 2.0", licenseUrl: "https://creativecommons.org/licenses/by/2.0/", url: "https://commons.wikimedia.org/wiki/File:Nasdaq_MarketSite_(51494550508).jpg" },
  { file: "tsx.jpg", title: "Exchange Tower, Toronto", author: "Ken Lund", license: "CC BY-SA 2.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/2.0/", url: "https://commons.wikimedia.org/wiki/File:Exchange_Tower,_Toronto_Stock_Exchange,_Toronto,_Ontario_(21219467213).jpg" },
  { file: "lse.jpg", title: "London Stock Exchange", author: "London Stock Exchange", license: "CC BY-SA 3.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0/", url: "https://commons.wikimedia.org/wiki/File:London_Stock_Exchange,_Paternoster_Square.jpg" },
  { file: "wallst.jpg", title: "Wall Street sign", author: "Acediscovery", license: "CC BY 4.0", licenseUrl: "https://creativecommons.org/licenses/by/4.0/", url: "https://commons.wikimedia.org/wiki/File:Wall-Street-Sign-New-York.jpg" },
  { file: "splash-wall-street.jpg", title: "Wall Street, New York (title screen)", author: "Dietmar Rabich", license: "CC BY-SA 4.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/", url: "https://commons.wikimedia.org/wiki/File:New_York_City_(New_York,_USA),_Wall_Street_--_2012_--_6614.jpg" },
];
