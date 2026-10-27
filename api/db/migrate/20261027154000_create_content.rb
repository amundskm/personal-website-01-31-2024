# Content that used to live in Sanity.
#
# Each document keeps a string `uid` (its Sanity `_id` for imported content),
# which references inside JSON use as `{ "_ref": uid }`. Nested structures
# (sections, rich text, links, image usages) are stored as JSON in the same
# shape Sanity stored them, and resolved by ContentResolver when read.
class CreateContent < ActiveRecord::Migration[8.1]
  def change
    create_table :images, id: :string do |t|
      t.integer :width, null: false
      t.integer :height, null: false
      t.text :lqip
      t.string :original_filename
      t.timestamps
    end

    create_table :site_settings do |t|
      t.string :title
      t.text :description
      t.string :footer_text
      t.jsonb :navigation, null: false, default: []
      t.jsonb :social_links, null: false, default: []
      t.jsonb :seo
      t.timestamps
    end

    create_table :pages do |t|
      t.string :uid, null: false, index: { unique: true }
      t.string :title, null: false
      t.string :slug, null: false, index: { unique: true }
      t.jsonb :sections, null: false, default: []
      t.jsonb :seo
      t.timestamps
    end

    create_table :posts do |t|
      t.string :uid, null: false, index: { unique: true }
      t.string :title, null: false
      t.string :slug, null: false, index: { unique: true }
      t.text :excerpt
      t.datetime :published_at, index: true
      t.string :tags, array: true, null: false, default: []
      t.jsonb :cover_image
      t.jsonb :body, null: false, default: []
      t.jsonb :seo
      t.timestamps
    end

    create_table :projects do |t|
      t.string :uid, null: false, index: { unique: true }
      t.string :title, null: false
      t.string :slug, null: false, index: { unique: true }
      t.text :summary
      t.string :tech_stack, array: true, null: false, default: []
      t.integer :year
      t.boolean :featured, null: false, default: false
      t.integer :position
      t.string :repo_url
      t.string :live_url
      t.jsonb :cover_image
      t.jsonb :body, null: false, default: []
      t.jsonb :gallery, null: false, default: []
      t.jsonb :seo
      t.timestamps
    end

    create_table :member_pages do |t|
      t.string :uid, null: false, index: { unique: true }
      t.string :title, null: false
      t.string :slug, null: false, index: { unique: true }
      t.text :summary
      # Cognito groups that may see the page; empty means admins only
      t.string :audiences, array: true, null: false, default: []
      t.jsonb :sections, null: false, default: []
      t.timestamps
    end

    # A single row: budgets, stage targets and merchant patterns
    create_table :spending_plans do |t|
      t.string :title
      t.jsonb :categories, null: false, default: []
      t.jsonb :stages, null: false, default: []
      t.timestamps
    end
  end
end
