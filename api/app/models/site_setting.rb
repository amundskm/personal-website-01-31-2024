# Header navigation, footer and default SEO. There is a single row.
class SiteSetting < ApplicationRecord
  def self.instance
    first_or_create!
  end
end
