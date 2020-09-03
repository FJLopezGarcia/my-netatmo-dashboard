import { Component, OnInit, ViewChild } from '@angular/core';
import { AngularFireAuth } from '@angular/fire/auth';
import { AngularFirestore } from '@angular/fire/firestore';
import { ActivatedRoute, Router } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';
import { catchError, map, switchMap, tap, take } from 'rxjs/operators';
import { User } from '../../models/user';
import { NetatmoService } from '../../services/netatmo.service';
import * as moment from 'moment';
import ChartDataLabels from 'chartjs-plugin-datalabels';
import { Chart } from 'chart.js';

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss'],
})
export class HomeComponent implements OnInit {
  @ViewChild('lineChartDaily')
  private chartRefDaily;
  @ViewChild('lineChartMonthly')
  private chartRefchartMonthly;

  chartDaily: any;
  chartMonthly: any;

  // Used for Charts
  bars: any;
  colorArray: any;
  hola: any;

  values$: Observable<User>;

  boilerDayResult: any = ([] = []);
  boilerMonthResult: any = ([] = []);
  weatherDayResult: any = ([] = []);

  netatmoAuthorize: string | null = null;
  authorizeError: string | null = null;

  constructor(
    readonly afAuth: AngularFireAuth,
    private readonly afs: AngularFirestore,
    private readonly activatedRoute: ActivatedRoute,
    private readonly netatomService: NetatmoService,
    private readonly router: Router
  ) {}

  ngOnInit() {
    this.authorizeError = null;
    this.netatmoAuthorize = null;
    if (this.activatedRoute.snapshot.queryParamMap.has('error')) {
      const error = this.activatedRoute.snapshot.queryParamMap.get('error');
      switch (error) {
        case 'invalid_request':
          this.authorizeError =
            'The request is missing a required parameter, includes an unsupported parameter or parameter value, or is otherwise malformed.';
          break;
        case 'invalid_client':
          this.authorizeError = 'The client identifier provided is invalid.';
          break;
        case 'unauthorized_client':
          this.authorizeError = 'The client is not authorized to use the requested response type.';
          break;
        case 'redirect_uri_mismatch':
          this.authorizeError = 'The redirection URI provided does not match a pre-registered value.';
          break;
        case 'access_denied':
          this.authorizeError = 'The end-user or authorization server denied the request.';
          break;
        case 'unsupported_response_type':
          this.authorizeError = 'The requested response type is not supported by the authorization server.';
          break;
        case 'invalid_scope':
          this.authorizeError = 'The requested scope is invalid, unknown, or malformed.';
          break;
      }
    } else {
      this.values$ = this.afAuth.user.pipe(
        map(user => user.uid),
        switchMap(uid =>
          this.afs
            .collection('users')
            .doc<User>(uid)
            .valueChanges()
        ),
        tap(user => {
          if (user == null || user.access_token == null) {
            this.netatmoAuthorize = this.netatomService.buildAuthorizationUrl();
            console.log('buildAuthorizationUrl: ', this.netatmoAuthorize);
          }
        }),
        switchMap(user => {
          if (user != null && user.expires_at <= Date.now() && user.refresh_token != null) {
            console.log('refresh netatmo access token using refresh token');
            return this.netatomService.refreshAccessToken(user.refresh_token).pipe(
              map(
                res => ({
                  access_token: res.access_token,
                  expires_at: new Date(Date.now() + res.expires_in * 1000).valueOf(),
                  refresh_token: res.refresh_token,
                  uid: user.uid,
                  enabled: user.enabled,
                }),
                tap((newUser: User) => {
                  console.log('updating user in firestore', newUser);
                  this.afs
                    .collection('users')
                    .doc<User>(user.uid)
                    .set(newUser, { merge: true });
                })
              )
            );
          } else if (user != null && user.refresh_token == null) {
            return throwError('Cannot refresh netatmo access token because the refresh token does not exist.');
          } else {
            console.log('user', user);
            return of(user);
          }
        }),
        catchError(err => {
          console.error('An error occurred while fetching data from firestore:', err);
          return of(null);
        })
      );
      // this.getMeasureByDays();
      // this.getMeasureMonhly();
    }
  }

  logout(): void {
    this.afAuth.auth.signOut();
    this.router.navigate(['/login']);
  }

  async getMeasureByDays() {
    const scale = '1day'; // 1month, 1day

    const date_begin = moment('2020-01')
      .startOf('month')
      .unix();
    const date_end = moment()
      .endOf('month')
      .unix();

    console.log('******** Timeline by Day ********');
    console.log('date_begin (timestamp): ', date_begin);
    console.log('date_begin: ', moment.unix(date_begin).format('DD/MM/YYYY HH:mmA'));
    console.log('date_end (timestamp): ', date_end);
    console.log('date_end: ', moment.unix(date_end).format('DD/MM/YYYY HH:mmA'));
    console.log('*******************************');

    const values = await this.values$.pipe(take(1)).toPromise();
    if (values !== null) {
      // reset result to be able to reload one every click
      this.boilerDayResult = [] = [];
      this.weatherDayResult = [] = [];

      // Boiler
      this.netatomService.getBoilerMeasure(values.access_token, scale, date_begin, date_end).subscribe(netatmomesure => {
        Object.keys(netatmomesure['body']).forEach(key => {
          this.boilerDayResult.push({
            date: key,
            boiler_on: Math.round((netatmomesure['body'][key][0] / 3600) * 100) / 100,
            boiler_off: Math.round((netatmomesure['body'][key][1] / 3600) * 100) / 100,
            total: Math.round(netatmomesure['body'][key][0] / 3600 + netatmomesure['body'][key][1] / 3600),
          });
        });
        console.log('******** getMeasure BOILER by Day result ********');
        console.log(this.boilerDayResult);
      });

      // Weather
      this.netatomService.getWeatherMeasure(values.access_token, scale, date_begin, date_end).subscribe(netatmomesure => {
        Object.keys(netatmomesure['body']).forEach(key => {
          this.weatherDayResult.push({
            date: key,
            Temperature: netatmomesure['body'][key][0],
            Humidity: netatmomesure['body'][key][1],
          });
        });
        console.log('******** getMeasure WEATHER by Day result ********');
        console.log(this.weatherDayResult);

        this.createBarChartDaily();
      });
    }
  }

  async getMeasureMonhly() {
    const scale = '1month'; // 1month, 1day
    const values = await this.values$.pipe(take(1)).toPromise();

    const date_begin = moment('2017-01')
      .startOf('month')
      .unix();
    const date_end = moment()
      .endOf('month')
      .unix();

    console.log('******** Timeline by Month ********');
    console.log('date_begin (timestamp): ', date_begin);
    console.log('date_begin: ', moment.unix(date_begin).format('DD/MM/YYYY HH:mmA'));
    console.log('date_end (timestamp): ', date_end);
    console.log('date_end: ', moment.unix(date_end).format('DD/MM/YYYY HH:mmA'));

    if (values !== null) {
      this.boilerMonthResult = [] = [];

      this.netatomService.getBoilerMeasure(values.access_token, scale, date_begin, date_end).subscribe(netatmomesure => {
        Object.keys(netatmomesure['body']).forEach(key => {
          this.boilerMonthResult.push({
            date: key,
            boiler_on: Math.round((netatmomesure['body'][key][0] / 3600) * 100) / 100,
            boiler_off: Math.round((netatmomesure['body'][key][1] / 3600) * 100) / 100,
            total: Math.round(netatmomesure['body'][key][0] / 3600 + netatmomesure['body'][key][1] / 3600),
          });
        });
        console.log('******** getMeasure BOILER by Month result ********');
        console.log(this.boilerMonthResult);
        this.createBarChartMonthly();
      });
    }
  }

  createBarChartDaily() {
    const dataset_date: any = ([] = []);
    const dataset_boiler_on: any = ([] = []);
    const dataset_boiler_off: any = ([] = []);
    const dataset_total: any = ([] = []);

    const dataset_weather_date: any = ([] = []);
    const dataset_weather_temp: any = ([] = []);
    const dataset_weather_hum: any = ([] = []);

    for (const k in this.boilerDayResult) {
      if (this.boilerDayResult.hasOwnProperty(k)) {
        dataset_date.push(moment.unix(this.boilerDayResult[k].date).format('DD/MM/YYYY'));
        dataset_boiler_on.push(this.boilerDayResult[k].boiler_on);
        dataset_boiler_off.push(this.boilerDayResult[k].boiler_off);
        dataset_total.push(this.boilerDayResult[k].total);
      }
    }

    for (const k in this.weatherDayResult) {
      if (this.weatherDayResult.hasOwnProperty(k)) {
        dataset_weather_date.push(moment.unix(this.weatherDayResult[k].date).format('DD/MM/YYYY'));
        dataset_weather_temp.push(this.weatherDayResult[k].Temperature);
        dataset_weather_hum.push(this.weatherDayResult[k].Humidity);
      }
    }

    const chartColors = {
      red: 'rgb(255, 99, 132)',
      orange: 'rgb(255, 159, 64)',
      yellow: 'rgb(255, 205, 86)',
      green: 'rgb(75, 192, 192)',
      blue: 'rgb(54, 162, 235)',
      purple: 'rgb(153, 102, 255)',
      grey: 'rgb(201, 203, 207)',
    };
    if (this.chartDaily) {
      this.chartDaily.destroy();
    }

    this.chartDaily = new Chart(this.chartRefDaily.nativeElement, {
      type: 'bar', // Type defines the variety of chart e.g. line, bar, pie etc
      data: {
        labels: dataset_date, // your labels array
        datasets: [
          {
            label: 'Sum boiler on', // To label a particular data set
            data: dataset_boiler_on,
            backgroundColor: chartColors.red, // array should have same number of elements as number of dataset
            borderColor: chartColors.red, // array should have same number of elements as number of dataset
            borderWidth: 1,
            fill: true,
            datalabels: {
              align: 'end',
              anchor: 'start',
            },
            yAxisID: 'A',
          },
          {
            label: 'Sum boiler off',
            data: dataset_boiler_off,
            backgroundColor: chartColors.green, // array should have same number of elements as number of dataset
            borderColor: chartColors.green, // array should have same number of elements as number of dataset
            borderWidth: 1,
            fill: true,
            datalabels: {
              align: 'start',
              anchor: 'end',
            },
            yAxisID: 'A',
          },
          {
            label: 'Total Hrs',
            data: dataset_total,
            backgroundColor: chartColors.grey, // array should have same number of elements as number of dataset
            borderColor: chartColors.grey,
            borderWidth: 1,
            // type: 'line', // Changes this dataset to become a line
            fill: true,
            datalabels: {
              // align: function(context) {
              //   var index = context.dataIndex;
              //   var value = context.dataset.data[index];
              //   return value < 24 ? 'end' : 'start';
              // },
              align: 'end',
              anchor: 'end',
            },
            yAxisID: 'A',
          },
          {
            label: 'Weather Temp', // To label a particular data set
            data: dataset_weather_temp,
            backgroundColor: chartColors.purple, // array should have same number of elements as number of dataset
            borderColor: chartColors.purple, // array should have same number of elements as number of dataset
            borderWidth: 1.5,
            type: 'line',
            fill: false,
            datalabels: {
              align: 'end',
              anchor: 'start',
              color: 'blue',
            },
            yAxisID: 'B',
          },
          // {
          //   label: 'Weather Humidity', // To label a particular data set
          //   data: dataset_weather_hum,
          //   backgroundColor: chartColors.orange, // array should have same number of elements as number of dataset
          //   borderColor: chartColors.orange, // array should have same number of elements as number of dataset
          //   borderWidth: 1.5,
          //   type: 'line',
          //   fill: false,
          //   datalabels: {
          //     align: 'end',
          //     anchor: 'start',
          //     color: 'blue',
          //   },
          //   yAxisID: 'B',
          // },
        ],
      },
      plugins: [ChartDataLabels],
      options: {
        plugins: {
          datalabels: {
            color: 'black',
            // anchor: 'center',
            // align: 'center',
            rotation: -90,
            // formatter: Math.round,
            display: function(context) {
              return context.dataset.data[context.dataIndex] > 0;
            },
            font: {
              weight: 'normal',
            },
          },
        },
        responsive: true,
        legend: {
          display: true,
          position: 'top',
          labels: {
            fontColor: 'black',
          },
        },
        title: {
          display: true,
          position: 'top',
          text: 'Netatmo Boiler/Weather dashboard - Daily',
        },
        scales: {
          xAxes: [
            {
              stacked: true,
            },
          ],
          yAxes: [
            {
              id: 'A',
              type: 'linear',
              position: 'left',
              ticks: {
                stepSize: 1,
                suggestedMin: 0,
                suggestedMax: 26,
              },
            },
            {
              id: 'B',
              type: 'linear',
              position: 'right',
              ticks: {
                stepSize: 1,
                suggestedMin: 0,
                suggestedMax: 45,
              },
            },
          ],
        },
        tooltips: {
          enabled: true,
          mode: 'x',
        },
      },
    });
  }

  createBarChartMonthly() {
    const dataset_date: any = ([] = []);
    const dataset_boiler_on: any = ([] = []);
    const dataset_boiler_off: any = ([] = []);
    const dataset_total: any = ([] = []);

    for (const k in this.boilerMonthResult) {
      if (this.boilerMonthResult.hasOwnProperty(k)) {
        dataset_date.push(moment.unix(this.boilerMonthResult[k].date).format('DD/MM/YYYY'));
        dataset_boiler_on.push(this.boilerMonthResult[k].boiler_on);
        dataset_boiler_off.push(this.boilerMonthResult[k].boiler_off);
        dataset_total.push(this.boilerMonthResult[k].total);
      }
    }

    const chartColors = {
      red: 'rgb(255, 99, 132)',
      orange: 'rgb(255, 159, 64)',
      yellow: 'rgb(255, 205, 86)',
      green: 'rgb(75, 192, 192)',
      blue: 'rgb(54, 162, 235)',
      purple: 'rgb(153, 102, 255)',
      grey: 'rgb(201, 203, 207)',
    };
    if (this.chartMonthly) {
      this.chartMonthly.destroy();
    }

    this.chartMonthly = new Chart(this.chartRefchartMonthly.nativeElement, {
      type: 'horizontalBar', // Type defines the variety of chart e.g. line, bar, pie etc
      data: {
        labels: dataset_date, // your labels array
        datasets: [
          {
            label: 'Sum boiler on', // To label a particular data set
            data: dataset_boiler_on,
            backgroundColor: chartColors.red, // array should have same number of elements as number of dataset
            borderColor: chartColors.red, // array should have same number of elements as number of dataset
            borderWidth: 1,
            fill: true,
            datalabels: {
              align: 'center',
              anchor: 'center',
            },
          },
          {
            label: 'Sum boiler off',
            data: dataset_boiler_off,
            backgroundColor: chartColors.green, // array should have same number of elements as number of dataset
            borderColor: chartColors.green, // array should have same number of elements as number of dataset
            borderWidth: 1,
            fill: true,
            datalabels: {
              align: 'center',
              anchor: 'center',
            },
          },
          {
            label: 'Total Hrs',
            data: dataset_total,
            backgroundColor: chartColors.grey, // array should have same number of elements as number of dataset
            borderColor: chartColors.grey,
            borderWidth: 1,
            // type: 'line',           // Changes this dataset to become a line
            fill: true,
            datalabels: {
              align: 'center',
              anchor: 'end',
            },
          },
        ],
      },
      plugins: [ChartDataLabels],
      options: {
        plugins: {
          datalabels: {
            color: 'black',
            // anchor: 'center',
            // align: 'center',
            rotation: 0,
            formatter: Math.round,
            display: function(context) {
              return context.dataset.data[context.dataIndex] > 1;
            },
            font: {
              weight: 'normal',
            },
          },
        },
        responsive: true,
        legend: {
          display: true,
          position: 'top',
          labels: {
            fontColor: 'black',
          },
        },
        title: {
          display: true,
          position: 'top',
          text: 'Netatmo Boiler dashboard - Monthly',
        },
        scales: {
          yAxes: [
            {
              stacked: true,
            },
          ],
        },
        tooltips: {
          enabled: true,
          mode: 'y',
        },
      },
    });
  }
}
