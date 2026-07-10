begin;

drop policy if exists "Public insert chai_shop" on public.chai_shop;
create policy "Public insert chai_shop"
on public.chai_shop
for insert
with check (true);

drop policy if exists "Public insert chai_reviewer" on public.chai_reviewer;
create policy "Public insert chai_reviewer"
on public.chai_reviewer
for insert
with check (true);

drop policy if exists "Public insert chai_item" on public.chai_item;
create policy "Public insert chai_item"
on public.chai_item
for insert
with check (true);

drop policy if exists "Public insert chai_review" on public.chai_review;
create policy "Public insert chai_review"
on public.chai_review
for insert
with check (true);

drop policy if exists "Public update chai_review" on public.chai_review;
create policy "Public update chai_review"
on public.chai_review
for update
using (true)
with check (true);

grant usage on schema public to anon, authenticated;
grant select on public.chai_shop to anon, authenticated;
grant select on public.chai_reviewer to anon, authenticated;
grant select on public.chai_item to anon, authenticated;
grant select on public.chai_review to anon, authenticated;
grant select on public.chai_review_row_details to anon, authenticated;
grant insert on public.chai_shop to anon, authenticated;
grant insert on public.chai_reviewer to anon, authenticated;
grant insert on public.chai_item to anon, authenticated;
grant insert on public.chai_review to anon, authenticated;
grant update on public.chai_review to anon, authenticated;

commit;
