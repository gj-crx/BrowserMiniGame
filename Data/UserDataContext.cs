using ASPNetTestProject.Models;
using Microsoft.EntityFrameworkCore;

namespace ASPNetTestProject.Data
{
    public class UserDataContext : DbContext
    {
        public DbSet<Record> Records { get; set; }

        public UserDataContext(DbContextOptions<UserDataContext> options) : base(options)
        {

        }

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            modelBuilder.Entity<Record>().ToTable(nameof(Record));

        }
    }
}
