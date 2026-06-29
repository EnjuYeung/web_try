import { useEffect, useState } from "react";
import { loadMovieCategories } from "../api/movies";
import { categoryDisplayName } from "../utils/categories";

export function CategoryPickerDialog({ onClose, onConfirm, onError }) {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategories, setSelectedCategories] = useState([]);

  useEffect(() => {
    let active = true;

    loadMovieCategories()
      .then((result) => {
        if (active) setCategories(result.categories || []);
      })
      .catch((error) => {
        if (!active) return;
        onError(error);
        onClose();
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [onClose, onError]);

  function toggleCategory(categoryName) {
    setSelectedCategories((current) =>
      current.includes(categoryName)
        ? current.filter((name) => name !== categoryName)
        : [...current, categoryName]
    );
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <div aria-label="选择分类文件夹刷新" aria-modal="true" className="category-dialog" role="dialog">
        <div className="category-dialog-header">
          <h2>选择分类文件夹</h2>
          <button aria-label="关闭" className="dialog-close" onClick={onClose} type="button">
            ×
          </button>
        </div>

        <div className="category-dialog-body">
          {loading ? (
            <div className="category-dialog-empty">读取中</div>
          ) : categories.length === 0 ? (
            <div className="category-dialog-empty">未找到分类文件夹</div>
          ) : (
            categories.map((categoryName) => (
              <label className="category-option" key={categoryName}>
                <input
                  checked={selectedCategories.includes(categoryName)}
                  onChange={() => toggleCategory(categoryName)}
                  type="checkbox"
                />
                <span>{categoryDisplayName(categoryName)}</span>
              </label>
            ))
          )}
        </div>

        <div className="category-dialog-actions">
          <button className="dialog-button" onClick={onClose} type="button">
            取消
          </button>
          <button
            className="dialog-button dialog-button--primary"
            disabled={selectedCategories.length === 0 || loading}
            onClick={() => onConfirm(selectedCategories)}
            type="button"
          >
            确认刷新
          </button>
        </div>
      </div>
    </div>
  );
}
