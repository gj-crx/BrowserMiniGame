using ASPNetTestProject.Data;
using ASPNetTestProject.Models;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ASPNetTestProject.Controllers
{
    public class RecordsController : Controller
    {
        private readonly UserDataContext context;

        public RecordsController (UserDataContext userDataContext)
        {
            this.context = userDataContext;
        }

        [HttpPost]
        public IActionResult RecordSet(Record newRecordFromForm)
        {
            Console.WriteLine(newRecordFromForm.RecordHolderName + " is a nigger " + newRecordFromForm.RecordValue);
            if (ModelState.IsValid)
            {
                Console.WriteLine("Correct");
                context.Records.Add(newRecordFromForm);
                context.SaveChanges();
                return Redirect("/");
            }
            Console.WriteLine("Incorrect");
            return View("Index");
        }

        public async Task<IActionResult> Index()
        {
            return View(await context.Records.ToListAsync());
        }
    }
}
