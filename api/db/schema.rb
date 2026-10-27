# This file is auto-generated from the current state of the database. Instead
# of editing this file, please use the migrations feature of Active Record to
# incrementally modify your database, and then regenerate this schema definition.
#
# This file is the source Rails uses to define your schema when running `bin/rails
# db:schema:load`. When creating a new database, `bin/rails db:schema:load` tends to
# be faster and is potentially less error prone than running all of your
# migrations from scratch. Old migrations may fail to apply correctly if those
# migrations use external dependencies or application code.
#
# It's strongly recommended that you check this file into your version control system.

ActiveRecord::Schema[8.1].define(version: 2026_10_27_154000) do
  # These are extensions that must be enabled in order to support this database
  enable_extension "pg_catalog.plpgsql"

  create_table "active_storage_attachments", force: :cascade do |t|
    t.string "name", null: false
    t.string "record_type", null: false
    t.string "record_id", null: false
    t.bigint "blob_id", null: false
    t.datetime "created_at", null: false
    t.index ["blob_id"], name: "index_active_storage_attachments_on_blob_id"
    t.index ["record_type", "record_id", "name", "blob_id"], name: "index_active_storage_attachments_uniqueness", unique: true
  end

  create_table "active_storage_blobs", force: :cascade do |t|
    t.string "key", null: false
    t.string "filename", null: false
    t.string "content_type"
    t.text "metadata"
    t.string "service_name", null: false
    t.bigint "byte_size", null: false
    t.string "checksum"
    t.datetime "created_at", null: false
    t.index ["key"], name: "index_active_storage_blobs_on_key", unique: true
  end

  create_table "active_storage_variant_records", force: :cascade do |t|
    t.bigint "blob_id", null: false
    t.string "variation_digest", null: false
    t.index ["blob_id", "variation_digest"], name: "index_active_storage_variant_records_uniqueness", unique: true
  end

  create_table "images", id: :string, force: :cascade do |t|
    t.integer "width", null: false
    t.integer "height", null: false
    t.text "lqip"
    t.string "original_filename"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
  end

  create_table "member_pages", force: :cascade do |t|
    t.string "uid", null: false
    t.string "title", null: false
    t.string "slug", null: false
    t.text "summary"
    t.string "audiences", default: [], null: false, array: true
    t.jsonb "sections", default: [], null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["slug"], name: "index_member_pages_on_slug", unique: true
    t.index ["uid"], name: "index_member_pages_on_uid", unique: true
  end

  create_table "pages", force: :cascade do |t|
    t.string "uid", null: false
    t.string "title", null: false
    t.string "slug", null: false
    t.jsonb "sections", default: [], null: false
    t.jsonb "seo"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["slug"], name: "index_pages_on_slug", unique: true
    t.index ["uid"], name: "index_pages_on_uid", unique: true
  end

  create_table "posts", force: :cascade do |t|
    t.string "uid", null: false
    t.string "title", null: false
    t.string "slug", null: false
    t.text "excerpt"
    t.datetime "published_at"
    t.string "tags", default: [], null: false, array: true
    t.jsonb "cover_image"
    t.jsonb "body", default: [], null: false
    t.jsonb "seo"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["published_at"], name: "index_posts_on_published_at"
    t.index ["slug"], name: "index_posts_on_slug", unique: true
    t.index ["uid"], name: "index_posts_on_uid", unique: true
  end

  create_table "projects", force: :cascade do |t|
    t.string "uid", null: false
    t.string "title", null: false
    t.string "slug", null: false
    t.text "summary"
    t.string "tech_stack", default: [], null: false, array: true
    t.integer "year"
    t.boolean "featured", default: false, null: false
    t.integer "position"
    t.string "repo_url"
    t.string "live_url"
    t.jsonb "cover_image"
    t.jsonb "body", default: [], null: false
    t.jsonb "gallery", default: [], null: false
    t.jsonb "seo"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["slug"], name: "index_projects_on_slug", unique: true
    t.index ["uid"], name: "index_projects_on_uid", unique: true
  end

  create_table "site_settings", force: :cascade do |t|
    t.string "title"
    t.text "description"
    t.string "footer_text"
    t.jsonb "navigation", default: [], null: false
    t.jsonb "social_links", default: [], null: false
    t.jsonb "seo"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
  end

  create_table "spending_plans", force: :cascade do |t|
    t.string "title"
    t.jsonb "categories", default: [], null: false
    t.jsonb "stages", default: [], null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
  end

  add_foreign_key "active_storage_attachments", "active_storage_blobs", column: "blob_id"
  add_foreign_key "active_storage_variant_records", "active_storage_blobs", column: "blob_id"
end
