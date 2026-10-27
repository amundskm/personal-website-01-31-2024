# Drafts for the admin: saving a published document stores the edit in
# `draft` (the live columns are untouched) until Publish applies it. A
# document that has never been published (`published: false`) is edited in
# place and hidden from the site. `pending_delete` removes it on Publish.
class AddDrafts < ActiveRecord::Migration[8.1]
  def change
    %i[pages posts projects member_pages].each do |table|
      add_column table, :draft, :jsonb
      add_column table, :published, :boolean, null: false, default: true
      add_column table, :pending_delete, :boolean, null: false, default: false
    end
    add_column :site_settings, :draft, :jsonb
  end
end
