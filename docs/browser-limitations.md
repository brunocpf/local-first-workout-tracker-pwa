# Known browser limitations

- iOS PWAs are suspended in the background: **rest-timer alerts are not guaranteed** when locked/backgrounded. Timer state is timestamp-based and recomputed on return. Do not claim locked-screen alarms until verified on device. Test the Screen Wake Lock API.
- Browser storage can be evicted; keep JSON backups.
- Push notifications are not a substitute for local timer alarms.

Add findings from real-device testing here.
