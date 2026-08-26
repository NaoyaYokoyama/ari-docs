type Props = {
  items: SearchItem[];
};

function SearchResult({ items }: Props) {
  if (items.length === 0) {
    return null;
  }

  return (
    <div className="mt-8">
      <p className="mb-4 text-sm text-slate-500">
        検索結果 {items.length}件
      </p>

      <div>
        {items.map((item) => (
          <div
            key={`${item.viewType}-${item.nodeId}-${item.noteId}-${item.wikiId}`}
            className="cursor-pointer border-b border-slate-200 px-2 py-4 hover:bg-slate-50"
          >
            <div className="font-medium">
              {item.name}
            </div>

            <div className="mt-1 text-sm text-slate-500">
              {item.viewType}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default SearchResult;
