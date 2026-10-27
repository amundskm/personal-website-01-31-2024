class Post < ApplicationRecord
  include Document

  scope :newest_first, -> { order(arel_table[:published_at].desc.nulls_last) }
end
