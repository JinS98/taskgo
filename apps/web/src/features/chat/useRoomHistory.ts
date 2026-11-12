import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import type { Auth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import type { RoomTarget } from '@taskgo/contracts';
import { fetchMessagePage, type MessageCursor } from './messageHistory';
import { useLiveChatStore, type LiveChatMessage } from './useLiveChatStore';

export function useRoomHistory(
  auth: Auth,
  target: RoomTarget,
  roomKey: string,
  messages: LiveChatMessage[],
  scrollRef: RefObject<HTMLDivElement | null>,
) {
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState('');
  const cursorRef = useRef<MessageCursor | undefined>(undefined);
  const refreshPromiseRef = useRef<Promise<void> | null>(null);
  const generationRef = useRef(0);
  const atBottomRef = useRef(true);
  const anchorRef = useRef<{ height: number; top: number } | null>(null);
  const mergeHistory = useLiveChatStore((state) => state.mergeHistory);

  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const anchor = anchorRef.current;
    if (anchor) {
      element.scrollTop = anchor.top + element.scrollHeight - anchor.height;
      anchorRef.current = null;
    } else if (atBottomRef.current) {
      element.scrollTop = element.scrollHeight;
    }
  }, [messages, scrollRef]);

  const onScroll = useCallback(() => {
    const element = scrollRef.current;
    if (element) atBottomRef.current = element.scrollHeight - element.scrollTop - element.clientHeight < 100;
  }, [scrollRef]);

  const refresh = useCallback((): Promise<void> => {
    if (refreshPromiseRef.current) return refreshPromiseRef.current;
    const generation = generationRef.current;
    const task = (async () => {
      setLoading(true);
      setError('');
      try {
        const current = useLiveChatStore.getState().messagesByRoom[roomKey] ?? [];
        const knownNewest = [...current].reverse().find((item) => item.messageId)?.messageId;
        let after: MessageCursor | undefined;
        let page;
        do {
          page = await fetchMessagePage(getFirestore(auth.app), target, after);
          if (generation !== generationRef.current) return;
          mergeHistory(roomKey, page.messages);
          after = page.cursor;
          cursorRef.current = after;
          setHasMore(page.hasMore);
          if (!knownNewest || page.messages.some((item) => item.messageId === knownNewest)) break;
        } while (page.hasMore && after);
      } catch {
        if (generation === generationRef.current) setError('이전 대화를 불러오지 못했습니다. 다시 시도해 주세요.');
      } finally {
        if (generation === generationRef.current) setLoading(false);
      }
    })();
    refreshPromiseRef.current = task;
    void task.finally(() => { if (refreshPromiseRef.current === task) refreshPromiseRef.current = null; });
    return task;
  }, [auth.app, mergeHistory, roomKey, target]);

  const loadOlder = useCallback(async () => {
    const cursor = cursorRef.current;
    if (!cursor || !hasMore || loadingOlder) return;
    const element = scrollRef.current;
    if (element) anchorRef.current = { height: element.scrollHeight, top: element.scrollTop };
    const generation = generationRef.current;
    setLoadingOlder(true);
    setError('');
    try {
      const page = await fetchMessagePage(getFirestore(auth.app), target, cursor);
      if (generation !== generationRef.current) return;
      mergeHistory(roomKey, page.messages);
      cursorRef.current = page.cursor;
      setHasMore(page.hasMore);
    } catch {
      anchorRef.current = null;
      if (generation === generationRef.current) setError('이전 대화를 불러오지 못했습니다. 다시 시도해 주세요.');
    } finally {
      if (generation === generationRef.current) setLoadingOlder(false);
    }
  }, [auth.app, hasMore, loadingOlder, mergeHistory, roomKey, scrollRef, target]);

  useEffect(() => {
    void refresh();
    return () => { generationRef.current += 1; refreshPromiseRef.current = null; };
  }, [refresh]);

  return { loading, loadingOlder, hasMore, error, refresh, loadOlder, onScroll };
}