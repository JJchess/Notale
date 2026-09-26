'use client';
import {useI18n} from '../i18n/react';

import {useSyncExternalStore} from 'react';
import {notificationState} from '../state/notifications';
export function Notifications(){
 const t=useI18n();
const notice=useSyncExternalStore(notificationState.subscribe,notificationState.getSnapshot,notificationState.getServerSnapshot);return <div id="toast" role="alert" hidden={!notice.visible}>{t(notice.message)}</div>;}
