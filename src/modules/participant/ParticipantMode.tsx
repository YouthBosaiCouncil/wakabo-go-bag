import React, { useState, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { db, appId, doc, setDoc, serverTimestamp } from '../../lib/firebase';
import { Card, Button, Item } from '../../components/ui';
import { NotificationType, SessionInfo, ItemData } from '../../types';
import { getItemName, normalizeItem } from '../../lib/utils';

interface Props {
    info: {
        type: 'lesson' | 'workshop';
        team?: { id: string; teamNumber: number };
        session: { id: string; name: string };
        itemList: { name: string; items: (string | ItemData)[] };
    };
    setNotification: (n: NotificationType) => void;
    onSubmitted: (selectedItems: string[]) => void;
}

const ParticipantMode: React.FC<Props> = ({ info, setNotification, onSubmitted }) => {
    const [selectedItems, setSelectedItems] = useState<string[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleItemClick = (item: string | ItemData) => {
        const itemName = getItemName(item);
        setSelectedItems(prev => {
            if (prev.includes(itemName)) {
                return prev.filter(i => i !== itemName);
            } else {
                if (prev.length >= 10) {
                    setNotification({ type: 'error', message: 'アイテムは10個までしか選べません。' });
                    return prev;
                }
                return [...prev, itemName];
            }
        });
    };

    const handleSubmit = async () => {
        if (selectedItems.length === 0) {
            setNotification({ type: 'error', message: 'アイテムを少なくとも1つ選んでください。' });
            return;
        }

        setIsSubmitting(true);
        try {
            // データの保存先パスを決定
            // レッスンモード: teams/{teamId} (既存のドキュメントを更新)
            // ワークショップモード: participants/{userId} (新規作成または更新)

            if (info.type === 'lesson' && info.team) {
                const teamRef = doc(db, "artifacts", appId, "public", "data", "trainingSessions", info.session.id, "teams", info.team.id);
                await setDoc(teamRef, {
                    selectedItems: selectedItems,
                    isSubmitted: true,
                    submittedAt: serverTimestamp()
                }, { merge: true });
            } else {
                // ワークショップモード（個人参加）: 投票ごとに新しいIDで保存し、同一端末でも連続投票を許可
                const participantId = uuidv4();
                const participantRef = doc(db, "artifacts", appId, "public", "data", "trainingSessions", info.session.id, "participants", participantId);
                await setDoc(participantRef, {
                    selectedItems: selectedItems,
                    submittedAt: serverTimestamp()
                }, { merge: true });
            }

            setNotification({ type: 'success', message: '提出しました！' });
            onSubmitted(selectedItems);
        } catch (error) {
            console.error('Error submitting items:', error);
            setNotification({ type: 'error', message: '提出に失敗しました。もう一度お試しください。' });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="w-full max-w-4xl mx-auto space-y-6 animate-in fade-in duration-500">
            <div className="text-center mb-8">
                <h2 className="text-2xl font-bold text-foreground mb-2">{info.session.name}</h2>
                <p className="text-muted-foreground">
                    {info.type === 'lesson' && info.team
                        ? `チーム ${info.team.teamNumber}`
                        : '個人ワーク'}
                </p>
                <p className="mt-4 text-lg font-medium text-foreground">
                    必要なアイテムを選んでください (最大10個)
                </p>
                <div className="mt-2 text-sm text-muted-foreground">
                    選択中: <span className="font-bold text-primary text-lg">{selectedItems.length}</span> / 10
                </div>
            </div>

            <Card>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 p-2">
                    {info.itemList.items.map((item, index) => {
                        const itemName = getItemName(item);
                        return (
                            <Item
                                key={`${itemName}-${index}`}
                                item={item}
                                isSelected={selectedItems.includes(itemName)}
                                onClick={() => handleItemClick(item)}
                            />
                        );
                    })}
                </div>
            </Card>

            <div className="sticky bottom-6 flex justify-center">
                <Button
                    onClick={handleSubmit}
                    disabled={selectedItems.length === 0 || isSubmitting}
                    size="lg"
                    className="shadow-xl w-full max-w-xs text-lg"
                >
                    {isSubmitting ? "提出中..." : "この内容で提出する"}
                </Button>
            </div>
        </div>
    );
};

export default ParticipantMode;
