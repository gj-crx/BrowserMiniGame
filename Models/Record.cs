using System.ComponentModel.DataAnnotations;

namespace ASPNetTestProject.Models
{
    public class Record
    {
        [Key]
        public required string RecordHolderName { get; set; }

        public int RecordValue { get; set; }

    }
}
