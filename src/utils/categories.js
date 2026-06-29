const CATEGORY_DISPLAY_NAMES = {
  动漫电影: "谁不爱呢",
  港台电影: "不要回来",
  国产电影: "天地不仁",
  欧美电影: "罗马和平",
  其他电影: "回首阑珊",
  日韩电影: "脱亚入欧"
};

export function categoryDisplayName(categoryName) {
  return Object.hasOwn(CATEGORY_DISPLAY_NAMES, categoryName)
    ? CATEGORY_DISPLAY_NAMES[categoryName]
    : categoryName;
}
