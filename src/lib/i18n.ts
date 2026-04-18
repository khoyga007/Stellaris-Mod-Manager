import { createContext, createElement, useContext, useEffect, useState, type ReactNode } from "react";

export type Lang = "en" | "vi";
const STORAGE_KEY = "lang.v1";

function detectInitial(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "en" || saved === "vi") return saved;
  } catch {
    // ignore
  }
  if (typeof navigator !== "undefined" && navigator.language?.toLowerCase().startsWith("vi")) {
    return "vi";
  }
  return "en";
}

type Dict = Record<string, string>;

const EN: Dict = {
  // Sidebar
  "nav.mods": "Mods",
  "nav.download": "Download",
  "nav.collections": "Collections",
  "nav.conflicts": "Conflicts",
  "nav.logs": "Logs",
  "nav.settings": "Settings",
  "sidebar.tipTitle": "Tip",
  "sidebar.tipBody": "Paste a Workshop or Collection URL in Download tab to bulk-install.",
  "sidebar.brandSubtitle": "Mod Manager",

  // Common
  "common.cancel": "Cancel",
  "common.apply": "Apply",
  "common.clear": "Clear",
  "common.clearAll": "Clear all",
  "common.retry": "Retry",
  "common.save": "Save",
  "common.close": "Close",
  "common.loading": "Loading...",
  "common.all": "All",
  "common.enable": "Enable",
  "common.disable": "Disable",

  // ModsView toolbar
  "mods.searchPlaceholder": "Search mods...",
  "mods.updatesAvailable": "{count} updates available",
  "mods.checkUpdates": "Check updates",
  "mods.updateAll": "Update all ({count})",
  "mods.updating": "Updating...",
  "mods.autoSort": "Auto-sort",
  "mods.bisect": "Bisect",
  "mods.bisectTip": "50/50 bisect — find the mod that crashes your game",
  "mods.disableAll": "Disable all",
  "mods.enableAll": "Enable all",
  "mods.filters": "Filters",
  "mods.filtersWithCount": "Filters ({count})",
  "mods.filterByTooltip": "Filter by tag or status",
  "mods.statusLabel": "Status",
  "mods.tagsLabel": "Tags",
  "mods.statusAll": "All",
  "mods.statusUpdates": "Has update",
  "mods.statusOutdated": "Outdated",
  "mods.statusMissingDeps": "Missing deps",
  "mods.paneAvailable": "Available",
  "mods.paneActive": "Active",
  "mods.paneAvailableSubtitle": "{count} disabled",
  "mods.paneActiveSubtitle": "{count} enabled — top loads first, bottom overrides",
  "mods.dropToDisable": "Drop here to disable",
  "mods.dropToEnable": "Drop to enable",
  "mods.noDisabled": "No disabled mods",
  "mods.dragHereToEnable": "Drag mods here to enable",
  "mods.emptyTitle": "No mods installed yet",
  "mods.emptyBody": "Head to the Download tab and paste a Workshop URL or mod ID to install your first mod.",
  "mods.outdatedBadge": "outdated",
  "mods.updateBadge": "update",
  "mods.outdatedTooltip": "Built for {version} — game is different",
  "mods.updateTooltip": "Download latest version",
  "mods.autoSortTitle": "Auto-sort preview",
  "mods.autoSortSummary": "{movers} of {total} mods will move",

  // DownloadView
  "download.heroTitle": "Install from Steam Workshop",
  "download.heroBody":
    "Paste one or more Workshop URLs / IDs (one per line, or comma-separated). App tries public mirrors automatically — if they're rate-limited, use the manual options below.",
  "download.clipboardDetected":
    "Detected {count} Workshop {plural} in clipboard",
  "download.clipboardLinkOne": "link",
  "download.clipboardLinkMany": "links",
  "download.add": "Add",
  "download.placeholder": "Paste Workshop URLs / IDs here, one per line",
  "download.detected": "{count} {plural} detected",
  "download.modOne": "mod",
  "download.modMany": "mods",
  "download.ctrlEnter": "Ctrl+Enter to install",
  "download.installCollection": "Install collection",
  "download.installN": "Install {count} mods",
  "download.autoInstall": "Auto install",
  "download.treatAsCollection": "Treat as Steam Collection (install all items)",
  "download.disabledForBulk": "— disabled for bulk",
  "download.pasteFirst": "Paste one or more Workshop URLs / IDs (one per line).",
  "download.emptyCollection": "Collection is empty or could not be fetched.",
  "download.orManual": "Or install manually",
  "download.step1Title": "1. Open downloader",
  "download.step1Body":
    "Opens steamworkshopdownloader.io with the mod ID prefilled. Click \"Download\" there and save the zip.",
  "download.step2Title": "2. Import .zip",
  "download.step2Body":
    "Pick the downloaded zip — app extracts, writes the descriptor, and registers it with Stellaris automatically.",
  "download.activity": "Activity",
  "download.retryFailed": "Retry failed",
  "download.retryTooltip": "Retry download",
  "download.queueBatch": "Queueing {count} {label} in 1 SteamCMD session{suffix}",
  "download.queueNormal": "Queueing {count} {label}{suffix}",
  "download.nothingToDo":
    "Nothing to download — all {count} {label} already installed or duplicated.",
  "download.skipDuplicates": "{count} duplicate{plural}",
  "download.skipInstalled": "{count} already installed",
  "download.status.queued": "queued",
  "download.status.downloading": "downloading",
  "download.status.extracting": "extracting",
  "download.status.installing": "installing",
  "download.status.done": "done",
  "download.status.error": "error",

  // SettingsView (headers + common rows)
  "settings.title": "Settings",
  "settings.language": "Language",
  "settings.languageBody": "Choose the interface language.",
  "settings.langEn": "English",
  "settings.langVi": "Tiếng Việt",
  "settings.theme": "Theme",
  "settings.themeBody": "Pick the look and feel.",
};

const VI: Dict = {
  // Sidebar
  "nav.mods": "Mod",
  "nav.download": "Tải về",
  "nav.collections": "Bộ sưu tập",
  "nav.conflicts": "Xung đột",
  "nav.logs": "Nhật ký",
  "nav.settings": "Cài đặt",
  "sidebar.tipTitle": "Mẹo",
  "sidebar.tipBody": "Dán URL Workshop hoặc Collection vào tab Tải về để cài hàng loạt.",
  "sidebar.brandSubtitle": "Trình Quản Lý Mod",

  // Common
  "common.cancel": "Huỷ",
  "common.apply": "Áp dụng",
  "common.clear": "Xoá",
  "common.clearAll": "Xoá tất cả",
  "common.retry": "Thử lại",
  "common.save": "Lưu",
  "common.close": "Đóng",
  "common.loading": "Đang tải...",
  "common.all": "Tất cả",
  "common.enable": "Bật",
  "common.disable": "Tắt",

  // ModsView toolbar
  "mods.searchPlaceholder": "Tìm mod...",
  "mods.updatesAvailable": "Có {count} bản cập nhật",
  "mods.checkUpdates": "Kiểm tra cập nhật",
  "mods.updateAll": "Cập nhật tất cả ({count})",
  "mods.updating": "Đang cập nhật...",
  "mods.autoSort": "Sắp xếp tự động",
  "mods.bisect": "Bisect",
  "mods.bisectTip": "Bisect 50/50 — tìm mod gây crash game",
  "mods.disableAll": "Tắt tất cả",
  "mods.enableAll": "Bật tất cả",
  "mods.filters": "Lọc",
  "mods.filtersWithCount": "Lọc ({count})",
  "mods.filterByTooltip": "Lọc theo tag hoặc trạng thái",
  "mods.statusLabel": "Trạng thái",
  "mods.tagsLabel": "Tag",
  "mods.statusAll": "Tất cả",
  "mods.statusUpdates": "Có bản cập nhật",
  "mods.statusOutdated": "Lỗi thời",
  "mods.statusMissingDeps": "Thiếu phụ thuộc",
  "mods.paneAvailable": "Khả dụng",
  "mods.paneActive": "Đang bật",
  "mods.paneAvailableSubtitle": "{count} mod tắt",
  "mods.paneActiveSubtitle": "{count} đang bật — trên nạp trước, dưới ghi đè",
  "mods.dropToDisable": "Thả vào đây để tắt",
  "mods.dropToEnable": "Thả để bật",
  "mods.noDisabled": "Không có mod nào đang tắt",
  "mods.dragHereToEnable": "Kéo mod vào đây để bật",
  "mods.emptyTitle": "Chưa cài mod nào",
  "mods.emptyBody": "Sang tab Tải về và dán URL Workshop hoặc ID mod để cài mod đầu tiên.",
  "mods.outdatedBadge": "lỗi thời",
  "mods.updateBadge": "cập nhật",
  "mods.outdatedTooltip": "Xây cho phiên bản {version} — game khác phiên bản",
  "mods.updateTooltip": "Tải phiên bản mới nhất",
  "mods.autoSortTitle": "Xem trước sắp xếp",
  "mods.autoSortSummary": "{movers} trong {total} mod sẽ đổi vị trí",

  // DownloadView
  "download.heroTitle": "Cài đặt từ Steam Workshop",
  "download.heroBody":
    "Dán một hoặc nhiều URL / ID Workshop (mỗi dòng một cái, hoặc cách nhau bằng dấu phẩy). App sẽ tự thử các mirror công khai — nếu bị giới hạn, dùng các lựa chọn thủ công bên dưới.",
  "download.clipboardDetected": "Phát hiện {count} {plural} Workshop trong clipboard",
  "download.clipboardLinkOne": "liên kết",
  "download.clipboardLinkMany": "liên kết",
  "download.add": "Thêm",
  "download.placeholder": "Dán URL / ID Workshop vào đây, mỗi dòng một cái",
  "download.detected": "Phát hiện {count} {plural}",
  "download.modOne": "mod",
  "download.modMany": "mod",
  "download.ctrlEnter": "Ctrl+Enter để cài",
  "download.installCollection": "Cài cả collection",
  "download.installN": "Cài {count} mod",
  "download.autoInstall": "Cài tự động",
  "download.treatAsCollection": "Xử lý như Steam Collection (cài tất cả mục)",
  "download.disabledForBulk": "— tắt khi cài hàng loạt",
  "download.pasteFirst": "Dán một hoặc nhiều URL / ID Workshop (mỗi dòng một cái).",
  "download.emptyCollection": "Collection rỗng hoặc không tải được.",
  "download.orManual": "Hoặc cài thủ công",
  "download.step1Title": "1. Mở trình tải",
  "download.step1Body":
    "Mở steamworkshopdownloader.io với ID mod đã điền sẵn. Bấm \"Download\" ở đó rồi lưu zip về.",
  "download.step2Title": "2. Import .zip",
  "download.step2Body":
    "Chọn file zip đã tải — app sẽ tự giải nén, ghi descriptor và đăng ký với Stellaris.",
  "download.activity": "Hoạt động",
  "download.retryFailed": "Thử lại mod lỗi",
  "download.retryTooltip": "Tải lại",
  "download.queueBatch": "Đang xếp hàng {count} {label} trong 1 phiên SteamCMD{suffix}",
  "download.queueNormal": "Đang xếp hàng {count} {label}{suffix}",
  "download.nothingToDo": "Không có gì để tải — cả {count} {label} đã cài hoặc trùng lặp.",
  "download.skipDuplicates": "{count} trùng lặp",
  "download.skipInstalled": "{count} đã cài sẵn",
  "download.status.queued": "chờ",
  "download.status.downloading": "đang tải",
  "download.status.extracting": "đang giải nén",
  "download.status.installing": "đang cài",
  "download.status.done": "xong",
  "download.status.error": "lỗi",

  // SettingsView
  "settings.title": "Cài đặt",
  "settings.language": "Ngôn ngữ",
  "settings.languageBody": "Chọn ngôn ngữ hiển thị của giao diện.",
  "settings.langEn": "English",
  "settings.langVi": "Tiếng Việt",
  "settings.theme": "Giao diện",
  "settings.themeBody": "Chọn chủ đề màu.",
};

const DICTS: Record<Lang, Dict> = { en: EN, vi: VI };

function format(tpl: string, params?: Record<string, string | number>): string {
  if (!params) return tpl;
  return tpl.replace(/\{(\w+)\}/g, (_, k) => (params[k] !== undefined ? String(params[k]) : `{${k}}`));
}

interface LangCtx {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

const Ctx = createContext<LangCtx | null>(null);

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => detectInitial());

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      // ignore
    }
    if (typeof document !== "undefined") {
      document.documentElement.lang = lang;
    }
  }, [lang]);

  const setLang = (l: Lang) => setLangState(l);
  const t = (key: string, params?: Record<string, string | number>) => {
    const dict = DICTS[lang];
    const tpl = dict[key] ?? EN[key] ?? key;
    return format(tpl, params);
  };

  return createElement(Ctx.Provider, { value: { lang, setLang, t } }, children);
}

export function useLang(): LangCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useLang must be used within <LangProvider>");
  return v;
}
