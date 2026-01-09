import React, { useEffect, useState, useRef } from 'react';
import { appId, collection, query, onSnapshot } from '../../lib/firebase';
import { Card, Button, IconButton } from '../../components/ui';
import { ArrowLeft, Download, BarChart2, Users } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import type { Session, ItemList, SessionType } from '../../types';
import { getItemName } from '../../lib/utils';

interface ResultsDashboardProps {
    session: { id: string; name: string; type: SessionType };
    itemList: ItemList;
    onBack: () => void;
}

interface ChartData {
    name: string;
    count: number;
    category: string;
}

const ResultsDashboard: React.FC<ResultsDashboardProps> = ({ session, itemList, onBack }) => {
    const [results, setResults] = useState<ChartData[]>([]);
    const [loading, setLoading] = useState(true);
    const [participantCount, setParticipantCount] = useState(0);
    const mountedRef = useRef<boolean>(true);
    const unsubscribeRef = useRef<(() => void) | null>(null);

    useEffect(() => {
        mountedRef.current = true;

        const fetchResults = async () => {
            if (!mountedRef.current) return;

            try {
                const { db } = await import('../../lib/firebase');
                if (!db) return;

                // コレクションパスの決定（授業モードかワークショップモードか）
                const collectionPath = session.type === 'lesson' ? 'teams' : 'participants';
                const q = query(collection(db, "artifacts", appId, "public", "data", "trainingSessions", session.id, collectionPath));

                const unsubscribe = onSnapshot(q, (snapshot) => {
                    if (!mountedRef.current) return;

                    const data = snapshot.docs.map(doc => doc.data());
                    setParticipantCount(data.length);

                    // 集計ロジック
                    if (itemList) {
                        const itemCounts: Record<string, number> = {};

                        // 初期化
                        itemList.items.forEach(item => {
                            const name = getItemName(item);
                            itemCounts[name] = 0;
                        });

                        // 集計
                        data.forEach((entry: { selectedItems?: string[] }) => {
                            if (entry.selectedItems && Array.isArray(entry.selectedItems)) {
                                entry.selectedItems.forEach((itemName: string) => {
                                    if (itemCounts[itemName] !== undefined) {
                                        itemCounts[itemName]++;
                                    }
                                });
                            }
                        });

                        // グラフ用データに変換
                        const chartData: ChartData[] = Object.entries(itemCounts)
                            .map(([name, count]) => {
                                const itemData = itemList.items.find(i => getItemName(i) === name);
                                const category = typeof itemData === 'object' && itemData !== null ? itemData.category : 'その他';
                                return {
                                    name,
                                    count,
                                    category: category || 'その他'
                                };
                            })
                            .sort((a, b) => b.count - a.count);

                        setResults(chartData);
                    }

                    setLoading(false);
                });

                unsubscribeRef.current = unsubscribe;
            } catch (error) {
                console.error('Error fetching results:', error);
                if (mountedRef.current) {
                    setLoading(false);
                }
            }
        };

        fetchResults();

        return () => {
            mountedRef.current = false;
            if (unsubscribeRef.current) {
                unsubscribeRef.current();
            }
        };
    }, [session, itemList]);

    // カテゴリーごとの色分け
    const getBarColor = (category: string) => {
        switch (category) {
            case '食料・水': return '#3b82f6'; // blue-500
            case '衛生用品': return '#10b981'; // emerald-500
            case '救急・安全': return '#ef4444'; // red-500
            case '生活用品': return '#f59e0b'; // amber-500
            case '貴重品': return '#8b5cf6'; // violet-500
            default: return '#6b7280'; // gray-500
        }
    };

    const exportCSV = () => {
        if (!results.length) return;

        const headers = ['アイテム名', 'カテゴリー', '選択数', '選択率(%)'];
        const csvContent = [
            headers.join(','),
            ...results.map(row => [
                row.name,
                row.category,
                row.count,
                participantCount > 0 ? ((row.count / participantCount) * 100).toFixed(1) : '0'
            ].join(','))
        ].join('\n');

        const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `${session.name}_集計結果.csv`;
        link.click();
        link.remove();
    };

    return (
        <div className="space-y-8 mt-6 animate-in fade-in duration-500">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <IconButton onClick={onBack} className="bg-secondary hover:bg-secondary/80 shadow-sm">
                        <ArrowLeft size={20} />
                    </IconButton>
                    <div>
                        <h2 className="text-3xl font-bold text-foreground tracking-tight">{session.name}</h2>
                        <div className="flex items-center gap-2 mt-1">
                            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-primary/10 text-primary border border-primary/20">
                                集計結果
                            </span>
                            <span className="text-muted-foreground text-sm">
                                {session.type === 'lesson' ? 'チーム数' : '参加者数'}: <span className="font-mono font-bold text-foreground">{participantCount}</span>
                            </span>
                        </div>
                    </div>
                </div>
                <Button onClick={exportCSV} disabled={results.length === 0} variant="secondary" className="shadow-sm hover:bg-secondary/50">
                    <Download size={18} className="mr-2" />
                    CSV出力
                </Button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* グラフ表示エリア */}
                <div className="lg:col-span-2">
                    <Card className="flex flex-col shadow-lg border-primary/5 overflow-hidden" style={{ minHeight: '600px' }}>
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4 p-6 pb-0">
                            <h3 className="text-xl font-bold text-foreground flex items-center gap-2">
                                <BarChart2 size={24} className="text-primary" />
                                アイテム選択率
                            </h3>
                            <div className="flex flex-wrap gap-3 text-xs">
                                {['食料・水', '衛生用品', '救急・安全', '生活用品', '貴重品'].map(cat => (
                                    <div key={cat} className="flex items-center gap-1.5 bg-secondary/30 px-2 py-1 rounded-md border border-border/50">
                                        <div className="w-2.5 h-2.5 rounded-full shadow-sm" style={{ backgroundColor: getBarColor(cat) }}></div>
                                        <span className="text-muted-foreground font-medium">{cat}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {loading ? (
                            <div className="flex-1 flex items-center justify-center min-h-[400px]">
                                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
                            </div>
                        ) : results.length === 0 ? (
                            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground bg-secondary/10 rounded-xl border-2 border-dashed border-border/50 m-6 min-h-[400px]">
                                <BarChart2 size={48} className="opacity-20 mb-4" />
                                <p>データがありません</p>
                            </div>
                        ) : (
                            <div className="w-full overflow-x-auto custom-scrollbar">
                                <div style={{ height: Math.max(500, results.length * 60), minWidth: '600px' }} className="pr-6">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart
                                            data={results}
                                            layout="vertical"
                                            margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
                                        >
                                            <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="hsl(var(--border))" opacity={0.4} />
                                            <XAxis type="number" domain={[0, 'auto']} hide />
                                            <YAxis
                                                type="category"
                                                dataKey="name"
                                                width={180}
                                                tick={{ fill: 'hsl(var(--foreground))', fontSize: 14, fontWeight: 500 }}
                                                tickLine={false}
                                                axisLine={false}
                                                interval={0}
                                            />
                                            <Tooltip
                                                contentStyle={{
                                                    backgroundColor: 'hsl(var(--popover))',
                                                    borderColor: 'hsl(var(--border))',
                                                    color: 'hsl(var(--popover-foreground))',
                                                    borderRadius: '0.75rem',
                                                    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                                                    padding: '12px'
                                                }}
                                                itemStyle={{ color: 'hsl(var(--foreground))' }}
                                                labelStyle={{ color: 'hsl(var(--muted-foreground))', marginBottom: '0.25rem' }}
                                                cursor={{ fill: 'hsl(var(--primary))', opacity: 0.1, radius: 4 }}
                                                formatter={(value: number | undefined) => [`${value ?? 0} 票`, '選択数']}
                                            />
                                            <Bar dataKey="count" radius={[0, 6, 6, 0]} barSize={32} animationDuration={1000}>
                                                {results.map((entry, index) => (
                                                    <Cell key={`cell-${index}`} fill={getBarColor(entry.category)} />
                                                ))}
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                        )}
                    </Card>
                </div>

                {/* ランキング表示エリア */}
                <div className="lg:col-span-1">
                    <Card className="h-[600px] flex flex-col shadow-lg border-primary/5">
                        <h3 className="text-xl font-bold text-foreground mb-6 flex items-center gap-2">
                            <Users size={24} className="text-primary" />
                            人気アイテム TOP 10
                        </h3>

                        <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
                            {loading ? (
                                <div className="flex justify-center py-12">
                                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                                </div>
                            ) : results.length === 0 ? (
                                <div className="text-center py-12 text-muted-foreground">
                                    データがありません
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {results.slice(0, 10).map((item, index) => (
                                        <div key={item.name} className="flex items-center justify-between p-4 rounded-xl bg-secondary/30 border border-border/50 hover:bg-secondary/50 transition-colors group">
                                            <div className="flex items-center gap-4">
                                                <div className={`
                          w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shadow-sm
                          ${index < 3
                                                        ? 'bg-gradient-to-br from-yellow-400 to-orange-500 text-white'
                                                        : 'bg-muted text-muted-foreground'}
                        `}>
                                                    {index + 1}
                                                </div>
                                                <span className="font-medium text-foreground group-hover:text-primary transition-colors">{item.name}</span>
                                            </div>
                                            <div className="flex items-center gap-1.5">
                                                <span className="text-xl font-bold text-primary">{item.count}</span>
                                                <span className="text-xs text-muted-foreground font-medium pt-1">票</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </Card>
                </div>
            </div>
        </div>
    );
};

export default ResultsDashboard;
