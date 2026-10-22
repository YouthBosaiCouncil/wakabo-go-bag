import React, { useId, useState } from "react";
import { Modal, Button } from "../components/ui";
import { iconCategories, getIconComponent, suggestIcon } from "../lib/icons";
import { ItemData } from "../types";
import clsx from "clsx";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (item: ItemData) => void;
  existingItems: (string | ItemData)[];
}

const AddItemModal: React.FC<Props> = ({
  isOpen,
  onClose,
  onAdd,
  existingItems,
}) => {
  const fieldId = useId();
  const [name, setName] = useState("");
  const [selectedIcon, setSelectedIcon] = useState<string>("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("food");

  // アイテム名が変更されたときに推奨アイコンを設定
  const handleNameChange = (newName: string) => {
    setName(newName);
    if (!selectedIcon && newName.trim()) {
      const suggested = suggestIcon(newName);
      setSelectedIcon(suggested);
    }
  };

  const handleSubmit = () => {
    const trimmedName = name.trim();
    if (!trimmedName) return;

    const newItem: ItemData = {
      name: trimmedName,
      icon: selectedIcon || undefined,
      category: category.trim() || undefined,
      description: description.trim() || undefined,
    };

    onAdd(newItem);

    // フォームリセット
    setName("");
    setSelectedIcon("");
    setCategory("");
    setDescription("");
    setSelectedCategory("food");
    onClose();
  };

  const existingNames = existingItems.map((item) =>
    typeof item === "string" ? item : item.name,
  );

  const nameExists = existingNames.includes(name.trim());

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="新しいアイテムを追加">
      <div className="space-y-6">
        {/* アイテム名 */}
        <div>
          <label
            htmlFor={`${fieldId}-name`}
            className="block text-sm font-medium text-foreground mb-2"
          >
            アイテム名 *
          </label>
          <input
            id={`${fieldId}-name`}
            maxLength={100}
            aria-invalid={nameExists}
            type="text"
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            className="w-full p-3 bg-input border border-input text-foreground rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="例: 懐中電灯"
          />
          {nameExists && (
            <p className="text-red-500 text-sm mt-1">
              同じ名前のアイテムが既に存在します
            </p>
          )}
        </div>

        {/* カテゴリ */}
        <div>
          <label
            htmlFor={`${fieldId}-category`}
            className="block text-sm font-medium text-foreground mb-2"
          >
            カテゴリ
          </label>
          <input
            id={`${fieldId}-category`}
            maxLength={60}
            type="text"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full p-3 bg-input border border-input text-foreground rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="例: 電子機器"
          />
        </div>

        {/* アイコン選択 */}
        <div>
          <p className="block text-sm font-medium text-foreground mb-2">
            アイコン
          </p>

          {/* カテゴリタブ */}
          <div className="flex flex-wrap gap-1 mb-4">
            {Object.entries(iconCategories).map(([key, cat]) => (
              <button
                type="button"
                aria-pressed={selectedCategory === key}
                key={key}
                onClick={() => setSelectedCategory(key)}
                className={clsx(
                  "px-3 py-1 rounded text-sm transition-colors",
                  selectedCategory === key
                    ? "bg-blue-500 text-white"
                    : "bg-secondary text-muted-foreground hover:bg-input",
                )}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* アイコングリッド */}
          <div className="grid grid-cols-4 sm:grid-cols-5 gap-2 max-h-48 overflow-y-auto p-2 bg-secondary rounded">
            {iconCategories[
              selectedCategory as keyof typeof iconCategories
            ].icons.map((iconName) => {
              const IconComponent = getIconComponent(iconName);
              return (
                <button
                  type="button"
                  aria-label={iconName}
                  aria-pressed={selectedIcon === iconName}
                  key={iconName}
                  onClick={() => setSelectedIcon(iconName)}
                  className={clsx(
                    "p-3 rounded-lg transition-all hover:scale-105",
                    selectedIcon === iconName
                      ? "bg-blue-500 text-white"
                      : "bg-card hover:bg-blue-100 dark:hover:bg-blue-900/30",
                  )}
                  title={iconName}
                >
                  <IconComponent size={24} />
                </button>
              );
            })}
          </div>

          {/* 選択されたアイコンのプレビュー */}
          {selectedIcon && (
            <div className="mt-2 p-2 bg-card rounded flex items-center gap-2">
              <span className="text-sm text-muted-foreground">選択中:</span>
              {React.createElement(getIconComponent(selectedIcon), {
                size: 20,
              })}
              <span className="text-sm text-foreground">{selectedIcon}</span>
            </div>
          )}
        </div>

        {/* 説明 */}
        <div>
          <label
            htmlFor={`${fieldId}-description`}
            className="block text-sm font-medium text-foreground mb-2"
          >
            説明（省略可）
          </label>
          <textarea
            id={`${fieldId}-description`}
            maxLength={500}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full p-3 bg-input border border-input text-foreground rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 h-20 resize-none"
            placeholder="このアイテムについての詳細説明..."
          />
        </div>

        {/* プレビュー */}
        {name.trim() && (
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              プレビュー
            </label>
            <div className="inline-flex flex-col items-center gap-2 p-3 bg-card border border-border rounded-lg">
              {selectedIcon &&
                React.createElement(getIconComponent(selectedIcon), {
                  size: 24,
                })}
              <span className="text-sm">{name.trim()}</span>
              {category.trim() && (
                <span className="text-xs px-1 py-0.5 rounded bg-blue-500 bg-opacity-20 text-blue-600">
                  {category.trim()}
                </span>
              )}
            </div>
          </div>
        )}

        {/* ボタン */}
        <div className="flex gap-3 pt-4">
          <Button
            onClick={handleSubmit}
            disabled={!name.trim() || nameExists}
            className="flex-1"
          >
            追加
          </Button>
          <Button onClick={onClose} variant="secondary" className="flex-1">
            キャンセル
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default AddItemModal;
