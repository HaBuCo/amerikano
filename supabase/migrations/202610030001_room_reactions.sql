-- Players send quick reactions straight over the private room channel. The
-- client only accepts a fixed list of reaction ids, so no free text is relayed.
drop policy if exists "members can send room broadcasts" on realtime.messages;

create policy "members can send room broadcasts"
on realtime.messages for insert
to authenticated
with check (
  realtime.messages.extension = 'broadcast'
  and private.is_room_member(private.room_id_from_topic(realtime.topic()))
);
