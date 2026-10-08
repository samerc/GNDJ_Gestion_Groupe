using GNDJ.Application.Common.Interfaces;

namespace GNDJ.Application.Tests;

// Date blanks of the « remplir en ligne » forms accept a full date, a month/year or a year alone (parents often
// only know the year of a vaccine booster); everything else is refused.
public class TemplateFormDatesTests
{
    [Theory]
    [InlineData("2019-06-01")]
    [InlineData("06/2018")]
    [InlineData("12/2020")]
    [InlineData("2019")]
    public void Accepts_full_month_year_and_year(string v) => Assert.True(TemplateFormAnswers.IsFormDate(v));

    [Theory]
    [InlineData("13/2019")]
    [InlineData("00/2019")]
    [InlineData("1850")]
    [InlineData("2019-02-30")]
    [InlineData("01/06/2019")] // the client converts JJ/MM/AAAA to yyyy-MM-dd before sending
    [InlineData("juin 2019")]
    public void Refuses_the_rest(string v) => Assert.False(TemplateFormAnswers.IsFormDate(v));

    [Theory]
    [InlineData("2019-06-01", "01/06/2019")]
    [InlineData("06/2018", "06/2018")]
    [InlineData("2019", "2019")]
    public void Prints_dates_in_the_French_order(string v, string expected) => Assert.Equal(expected, TemplateFormAnswers.DisplayDate(v));
}
