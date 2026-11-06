import { Controller, Get, MessageEvent, Sse } from '@nestjs/common';
import { catchError, concatMap, from, interval, map, merge, Observable, of, startWith, throttleTime } from 'rxjs';
import { Principal } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators';
import { LiveService } from './live.service';

/** How often a dashboard refreshes even with no changes, so time-based alerts (registers due) appear. */
const REFRESH_MS = 60_000;
/** Bursts of changes (a whole CBT class submitting) become one update per this window. */
const THROTTLE_MS = 1_500;
/** Keeps proxies and mobile networks from closing a quiet stream. */
const PING_MS = 25_000;

/**
 * Live monitoring for staff. `GET /live` returns the current picture once; `GET /live/stream`
 * is a Server-Sent Events stream that sends a fresh `snapshot` whenever attendance, payments,
 * CBT sittings, AI usage or safety flags change in the school.
 */
@Controller('live')
export class LiveController {
  constructor(private readonly live: LiveService) {}

  @Get()
  snapshot(@CurrentUser() u: Principal) {
    return this.live.snapshot(u);
  }

  @Sse('stream')
  stream(@CurrentUser() u: Principal): Observable<MessageEvent> {
    const triggers = merge(
      this.live.forSchool(u.schoolId).pipe(throttleTime(THROTTLE_MS, undefined, { leading: true, trailing: true })),
      interval(REFRESH_MS),
    ).pipe(startWith(null));
    const snapshots = triggers.pipe(
      concatMap(() =>
        from(this.live.snapshot(u)).pipe(
          map((data): MessageEvent => ({ type: 'snapshot', data })),
          catchError(() => of<MessageEvent>({ type: 'problem', data: { message: 'Could not refresh the live view; retrying.' } })),
        ),
      ),
    );
    const pings = interval(PING_MS).pipe(map((): MessageEvent => ({ type: 'ping', data: { at: new Date().toISOString() } })));
    return merge(snapshots, pings);
  }
}
