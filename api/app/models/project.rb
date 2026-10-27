class Project < ApplicationRecord
  include Document

  # Manual order first (unset last), then newest
  scope :in_display_order, -> { order(arel_table[:position].asc.nulls_last, created_at: :desc) }
  scope :featured, -> { where(featured: true) }
end
