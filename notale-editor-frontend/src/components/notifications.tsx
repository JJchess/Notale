'use client';
import {useSyncExternalStore} from 'react';
import {notificationState} from '../state/notifications';
export function Notifications(){const notice=useSyncExternalStore(notificationState.subscribe,notificationState.getSnapshot,notificationState.getServerSnapshot);return <div id="toast" role="alert" hidden={!notice.visible}>{notice.message}</div>;}
