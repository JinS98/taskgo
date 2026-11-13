import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, query, where, type Firestore } from 'firebase/firestore';
import { defaultChannelId, type DemoChannel, type DemoDirectMessage } from './demoConversations';

interface ScopedItems<T> { workspaceId: string; items: T[] }
interface DmRoom { id: string; participantIds: string[] }

export function useWorkspaceConversations(db?: Firestore, workspaceId?: string, viewerId?: string) {
  const [channels, setChannels] = useState<ScopedItems<DemoChannel>>({ workspaceId: '', items: [] });
  const [rooms, setRooms] = useState<ScopedItems<DmRoom>>({ workspaceId: '', items: [] });
  const [members, setMembers] = useState<{ workspaceId: string; emails: Record<string, string>; names: Record<string, string> }>({ workspaceId: '', emails: {}, names: {} });
  const [errors, setErrors] = useState<Record<'channels' | 'rooms' | 'members', string>>({ channels: '', rooms: '', members: '' });

  useEffect(() => {
    if (!db || !workspaceId || !viewerId) return;
    const stopChannels = onSnapshot(query(collection(db, 'channels'), where('workspaceId', '==', workspaceId)), (snapshot) => {
      setChannels({ workspaceId, items: snapshot.docs.map((item) => ({ id: item.id, name: String(item.get('name') || '채널') })) });
      setErrors((current) => ({ ...current, channels: '' }));
    }, () => setErrors((current) => ({ ...current, channels: '채널 목록을 불러오지 못했습니다.' })));
    const stopRooms = onSnapshot(query(collection(db, 'dmRooms'), where('workspaceId', '==', workspaceId), where('participantIds', 'array-contains', viewerId)), (snapshot) => {
      setRooms({ workspaceId, items: snapshot.docs.map((item) => ({ id: item.id, participantIds: item.get('participantIds') as string[] })) });
      setErrors((current) => ({ ...current, rooms: '' }));
    }, () => setErrors((current) => ({ ...current, rooms: 'DM 목록을 불러오지 못했습니다.' })));
    const stopMembers = onSnapshot(collection(db, 'workspaces', workspaceId, 'members'), (snapshot) => {
      setMembers({
        workspaceId,
        emails: Object.fromEntries(snapshot.docs.map((item) => [item.id, String(item.get('email') || item.id)])),
        names: Object.fromEntries(snapshot.docs.map((item) => [item.id, String(item.get('displayName') || `팀원-${item.id.slice(0, 4).toUpperCase()}`)])),
      });
      setErrors((current) => ({ ...current, members: '' }));
    }, () => setErrors((current) => ({ ...current, members: '멤버 목록을 불러오지 못했습니다.' })));
    return () => { stopChannels(); stopRooms(); stopMembers(); };
  }, [db, workspaceId, viewerId]);

  const availableChannels = useMemo(() => {
    if (!workspaceId) return [];
    const initial: DemoChannel = { id: defaultChannelId(workspaceId), name: '전체' };
    const actual = channels.workspaceId === workspaceId ? channels.items : [];
    return [initial, ...actual.filter((item) => item.id !== initial.id).sort((a, b) => a.name.localeCompare(b.name))];
  }, [channels, workspaceId]);

  const directMessages = useMemo(() => {
    if (!workspaceId || rooms.workspaceId !== workspaceId) return [];
    const names = members.workspaceId === workspaceId ? members.names : {};
    return rooms.items.map((room): DemoDirectMessage => {
      const otherId = room.participantIds.find((id) => id !== viewerId) ?? viewerId ?? '';
      const name = names[otherId] ?? `팀원-${otherId.slice(0, 4).toUpperCase()}`;
      return { id: room.id, name, initials: name.charAt(0).toUpperCase() };
    }).sort((a, b) => a.name.localeCompare(b.name));
  }, [members, rooms, viewerId, workspaceId]);

  return { channels: availableChannels, directMessages, memberEmails: members.workspaceId === workspaceId ? members.emails : {}, memberNames: members.workspaceId === workspaceId ? members.names : {}, error: Object.values(errors).filter(Boolean).join(' ') };
}
